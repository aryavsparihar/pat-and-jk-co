import type { Payload } from 'payload'
import { agreedInWords, artistTerms, TERMS_PHRASE } from './terms'

import type { Application, Member } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'

import { sendApplicationReceived, notifyStaffOfApplication } from './emails'
import {
  ARTIST_STEPS,
  ARTIST_STEP_SCHEMAS,
  type ArtistStep,
  fieldErrors,
  partnerSchema,
} from './forms/schemas'
import type { MemberKind } from './ids'
import { stepValues } from './forms/values'
import { identityFingerprint } from '@/kyc/identityCode'
import { partnerKycSchema, type PartnerKycInput } from '@/kyc/schema'
import { identityPhotoFacts, kycProblems, partnerKycProblems, savePartnerKyc } from '@/kyc/service'
import { actingFor } from '@/security/audit'

import { partnerAgreement } from './partnerAgreement'

/**
 * Reading, saving and submitting an applicant's own application.
 *
 * Every write goes through Payload *as the member* (overrideAccess: false), so the collection's
 * own rules apply on top of the checks here: only their own application, only while it is a draft
 * or has changes requested, and never the stage, the reference or the staff notes. The stage is
 * moved on submission with the server's authority, after everything stored has been re-checked.
 */

/** The privacy notice an applicant is agreeing to; bump it when the notice changes materially */
export const PRIVACY_NOTICE_VERSION = '2026-10'

export const EDITABLE: Application['stage'][] = ['draft', 'changes-requested']

const asMember = (member: Member) =>
  ({ user: { ...member, collection: 'members' } as never, overrideAccess: false }) as const

export const findOwnApplication = async (
  payload: Payload,
  member: Member,
  type: MemberKind,
  depth = 1,
): Promise<Application | null> => {
  // The newest is the current one; earlier ones are history
  const found = await payload.find({
    collection: 'applications',
    where: { and: [{ member: { equals: member.id } }, { type: { equals: type } }] },
    sort: '-createdAt',
    limit: 1,
    depth,
    ...asMember(member),
  })
  return found.docs[0] ?? null
}

export type SaveResult =
  | { ok: true; application: Application }
  | { ok: false; status: number; message: string; errors?: Record<string, string> }

/** What a step's validated data becomes on the application */
const toFields = (
  step: ArtistStep,
  data: Record<string, unknown>,
  termsDocument?: number,
): Partial<Application> => {
  switch (step) {
    case 'about':
      return {
        about: { ...data, dateOfBirth: `${String(data.dateOfBirth)}T00:00:00.000Z` } as never,
      }
    case 'address':
      return {
        address: {
          residence: data.residence,
          correspondenceSame: data.correspondenceSame,
          // Payload expects a group to be an object; the same address leaves the second one empty
          ...(data.correspondenceSame ? {} : { correspondence: data.correspondence }),
        } as never,
      }
    case 'practice':
      return { practice: data as never }
    case 'portfolio':
      return { portfolio: data.works as unknown[] as never }
    case 'kyc':
      return {}
    case 'review':
      return {
        declarations: {
          ...data,
          termsDocument: termsDocument ?? null,
          consentedAt: new Date().toISOString(),
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        } as never,
      }
  }
}

/** Checks one artist step and saves it. */
export const saveArtistStep = async (
  payload: Payload,
  member: Member,
  step: unknown,
  data: unknown,
): Promise<SaveResult> => {
  if (!ARTIST_STEPS.includes(step as ArtistStep)) {
    return { ok: false, status: 400, message: 'That is not a step of the application.' }
  }
  const name = step as ArtistStep
  if (name === 'kyc') {
    return { ok: false, status: 400, message: 'Identity details are saved separately.' }
  }
  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no artist application to save.' }
  if (!EDITABLE.includes(application.stage)) {
    return {
      ok: false,
      status: 409,
      message: 'This application has been sent and can no longer be changed.',
    }
  }

  const parsed = ARTIST_STEP_SCHEMAS[name].safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      message: 'A few things need another look.',
      errors: fieldErrors(parsed.error),
    }
  }

  // Pictures must be this artist's own, already uploaded through the portfolio endpoint
  if (name === 'portfolio') {
    const ids = (parsed.data as { works: { image: number }[] }).works.map((w) => w.image)
    const owned = await payload.count({
      collection: 'portfolio-images',
      where: { and: [{ id: { in: ids } }, { owner: { equals: member.id } }] },
      overrideAccess: true,
    })
    if (owned.totalDocs !== new Set(ids).size || new Set(ids).size !== ids.length) {
      return { ok: false, status: 422, message: 'Each work needs its own picture, uploaded here.' }
    }
  }

  // While terms are published, the last step asks for agreement in so many words, and records
  // which document was agreed to
  let termsDocument: number | undefined
  if (name === 'review') {
    const terms = await artistTerms(payload)
    if (terms) {
      const review = parsed.data as { agreeTerms?: boolean; agreeTyped?: string }
      const errors: Record<string, string> = {}
      if (review.agreeTerms !== true) errors.agreeTerms = 'Please tick that you agree to the terms.'
      if (!agreedInWords(review.agreeTyped))
        errors.agreeTyped = `Please type ${TERMS_PHRASE} to confirm.`
      if (Object.keys(errors).length > 0)
        return { ok: false, status: 422, message: 'A few things need another look.', errors }
      termsDocument = terms.id
    }
  }

  const completed = new Set(application.completedSteps ?? [])
  completed.add(name)
  // The identity photo shows the date of birth: a new one means a new photo, so Identity is to do
  // again (its save checks the photo against the details given now)
  if (name === 'about') {
    const before = application.about?.dateOfBirth?.slice(0, 10)
    const after = String((parsed.data as { dateOfBirth?: string }).dateOfBirth ?? '')
    if (before && before !== after) completed.delete('kyc')
  }
  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: {
      ...toFields(name, parsed.data as Record<string, unknown>, termsDocument),
      completedSteps: [...completed],
    },
    depth: 1,
    ...asMember(member),
    context: { disableRevalidate: true },
  })
  return { ok: true, application: updated }
}

/** Every step, re-checked from what is stored: nothing reaches review on the client's say-so */
export const artistProblems = (
  application: Application,
): Record<string, Record<string, string>> => {
  const problems: Record<string, Record<string, string>> = {}
  for (const step of ARTIST_STEPS) {
    const parsed = ARTIST_STEP_SCHEMAS[step].safeParse(stepValues(step, application))
    if (!parsed.success) problems[step] = fieldErrors(parsed.error)
  }
  return problems
}

const submit = async (
  payload: Payload,
  member: Member,
  application: Application,
  ip: string,
): Promise<Application> => {
  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: { stage: 'submitted', submittedAt: new Date().toISOString() },
    overrideAccess: true, // the stage is the server's to move; every check has been made above
    depth: 0,
    context: { disableRevalidate: true },
  })
  await logSecurityEvent(payload, {
    event: 'application-submitted',
    email: member.email,
    ip,
    subject: updated.reference,
    detail: `${updated.type}${application.stage === 'changes-requested' ? ', resubmitted' : ''}`,
  })
  await sendApplicationReceived(payload, { member, application: updated })
  await notifyStaffOfApplication(payload, { application: updated, name: displayNameOf(updated) })
  return updated
}

const displayNameOf = (app: Application) =>
  app.type === 'artist' ? app.about?.displayName || app.about?.legalName : app.partner?.fullName

/** Sends a finished artist application. */
export const submitArtistApplication = async (
  payload: Payload,
  member: Member,
  ip: string,
): Promise<SaveResult> => {
  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no artist application to send.' }
  if (!EDITABLE.includes(application.stage)) {
    return { ok: false, status: 409, message: 'This application has already been sent.' }
  }
  const problems = artistProblems(application)
  // Terms published since the last step was saved must still be agreed to
  const terms = await artistTerms(payload)
  const declarations = application.declarations as
    { agreeTerms?: boolean | null; agreeTyped?: string | null } | undefined
  if (terms && !(declarations?.agreeTerms && agreedInWords(declarations.agreeTyped))) {
    problems.review = {
      ...problems.review,
      agreeTerms: 'Please agree to the terms and conditions.',
    }
  }
  const kyc = await kycProblems(payload, member.id)
  if (kyc.length > 0) problems.kyc = { _form: kyc[0]! }
  else if (!(application.completedSteps ?? []).includes('kyc'))
    // Reopened when the date of birth changed after the identity photo was taken
    problems.kyc = {
      _form: 'Your date of birth has changed. Please take the photo of you again, in Identity.',
    }
  if (Object.keys(problems).length > 0) {
    const errors = Object.fromEntries(
      Object.entries(problems).flatMap(([step, fields]) =>
        Object.entries(fields).map(([field, message]) => [`${step}.${field}`, message]),
      ),
    )
    return { ok: false, status: 422, message: 'Some steps are not finished yet.', errors }
  }
  return { ok: true, application: await submit(payload, member, application, ip) }
}

/** What the partner form sends: its answers, identity details unless already given, agreement */
export type PartnerSubmission = {
  data?: unknown
  /** Omitted when the identity details given before are kept as they are */
  kyc?: unknown
  agreement?: { readToEnd?: unknown; typed?: unknown; version?: unknown }
}

export const AGREEMENT_NOT_READY =
  'The Partner/Trade Program agreement is not ready yet, so applications cannot be sent for now. Please come back in a little while.'

/**
 * Saves and sends a partner application in one go: the form is a single page. Everything is
 * checked first, and every problem is listed at once: the answers, the identity details (PAN, the
 * PAN card and the photo with its code and name, unless kept from before), and agreement to the
 * Partner/Trade Program, read to its end, I AGREE typed, and the version still the one published.
 * Only then are the identity details encrypted and kept, and the application sent.
 */
export const submitPartnerApplication = async (
  payload: Payload,
  member: Member,
  submission: PartnerSubmission | null,
  ip: string,
): Promise<SaveResult> => {
  const application = await findOwnApplication(payload, member, 'partner', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no partner application to send.' }
  if (!EDITABLE.includes(application.stage)) {
    return { ok: false, status: 409, message: 'This application has already been sent.' }
  }
  // Nothing can be sent until the agreement is published (Site settings → Applications)
  const agreement = await partnerAgreement(payload)
  if (!agreement) return { ok: false, status: 409, message: AGREEMENT_NOT_READY }

  const errors: Record<string, string> = {}
  const parsed = partnerSchema.safeParse(submission?.data)
  if (!parsed.success) Object.assign(errors, fieldErrors(parsed.error))

  // Identity: given now, or kept from before and still complete
  let kyc: PartnerKycInput | null = null
  let photo: Awaited<ReturnType<typeof identityPhotoFacts>> = null
  if (submission?.kyc !== undefined) {
    const given = partnerKycSchema.safeParse(submission.kyc)
    if (!given.success) Object.assign(errors, fieldErrors(given.error))
    else if (given.data.noticeVersion !== PRIVACY_NOTICE_VERSION)
      errors.consent = 'The privacy notice has changed since you read it. Please read it again.'
    else {
      kyc = given.data
      // The photo must show the name given now: the paper in it has the code and that name
      photo = await identityPhotoFacts(payload, {
        memberId: member.id,
        documentId: kyc.documents['identity-photo']!,
      })
      if (!photo || photo.fingerprint !== identityFingerprint(kyc.panName, null))
        errors['documents.identity-photo'] =
          'Your name has changed since this photo was taken. Please get a new code and take it again.'
    }
  } else {
    const missing = await partnerKycProblems(payload, member.id)
    if (missing.length) errors.kyc = missing[0]!
  }

  const said = submission?.agreement
  if (said?.version !== agreement.version)
    errors.agreement = 'The agreement has changed since you read it. Please read it again.'
  else if (said?.readToEnd !== true)
    errors.agreement = 'Please read the agreement to the end, then confirm.'
  else if (!agreedInWords(said?.typed))
    errors.agreement = `Please type ${TERMS_PHRASE} to agree to the Partner/Trade Program.`

  if (Object.keys(errors).length > 0 || !parsed.success) {
    return { ok: false, status: 422, message: 'A few things need another look.', errors }
  }

  if (kyc) {
    await savePartnerKyc(payload, {
      member,
      input: kyc,
      reference: application.reference,
      identityCode: photo,
      consent: {
        noticeVersion: PRIVACY_NOTICE_VERSION,
        confirmation: 'Read the privacy notice to the end, confirmed, and typed I AGREE',
      },
    })
  }

  const { category, ...partner } = parsed.data
  await payload.update({
    collection: 'applications',
    id: application.id,
    data: { partner, partnerCategory: category },
    depth: 0,
    ...asMember(member),
    context: { disableRevalidate: true },
  })
  // The partner may not write these themselves: the server records what was agreed, and how
  const saved = await payload.update({
    collection: 'applications',
    id: application.id,
    data: {
      partnerDeclarations: {
        consentProcessing: true,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        agreementVersion: agreement.version,
        agreedAt: new Date().toISOString(),
        agreementConfirmation: 'Read the agreement to the end, confirmed, and typed I AGREE',
        agreementDigest: agreement.digest,
      },
    },
    depth: 0,
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(member, 'members') },
  })
  return { ok: true, application: await submit(payload, member, saved, ip) }
}

const idOf = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : v)

/**
 * What a member's own application endpoint returns: what the application pages use, and nothing
 * else. Not the member record, not the identity code's times, not who decided it or when; the
 * staff note only where it was written for them.
 */
export const memberApplicationView = (a: Application) => ({
  reference: a.reference,
  type: a.type,
  stage: a.stage,
  completedSteps: a.completedSteps ?? [],
  decisionNote:
    a.stage === 'changes-requested' || a.stage === 'rejected' ? (a.decisionNote ?? null) : null,
  reapplyFrom: (a as { reapplyFrom?: string | null }).reapplyFrom ?? null,
  partnerCategory: a.partnerCategory ?? null,
  about: a.about,
  address: a.address,
  practice: a.practice,
  portfolio: (a.portfolio ?? []).map((work) => ({ ...work, image: idOf(work.image) })),
  declarations: a.declarations
    ? {
        originalWork: a.declarations.originalWork ?? null,
        accurate: a.declarations.accurate ?? null,
        consentProcessing: a.declarations.consentProcessing ?? null,
        agreeTerms: a.declarations.agreeTerms ?? null,
      }
    : null,
  partner: a.partner,
})
