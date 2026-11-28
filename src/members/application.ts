import type { Payload } from 'payload'
import { agreedInWords, TERMS_PHRASE } from './terms'

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
import { discardUnkeptPictures } from './portfolio'
import { actingFor } from '@/security/audit'
import { ARTIST_NOTICE_VERSION, TRADE_NOTICE_VERSION } from './applicationNotice'
import { type ConsentEvidence, consentRow } from './consentRecord'

/**
 * Reading, saving and submitting an applicant's own application.
 *
 * Every write goes through Payload *as the member* (overrideAccess: false), so the collection's
 * own rules apply on top of the checks here: only their own application, only while it is a draft
 * or has changes requested, and never the stage, the reference or the staff notes. The stage is
 * moved on submission with the server's authority, after everything stored has been re-checked.
 */

/** The privacy notice a trade applicant is agreeing to; bump it when the notice changes materially */
export const PRIVACY_NOTICE_VERSION = '2026-11-12'

/** The founder's line for I AGREE not typed as asked */
const AGREE_LINE = `Please type ${TERMS_PHRASE} in capitals to confirm.`

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
const toFields = (step: ArtistStep, data: Record<string, unknown>): Partial<Application> => {
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
    case 'review':
      return {
        declarations: {
          ...data,
          consentedAt: new Date().toISOString(),
          privacyNoticeVersion: ARTIST_NOTICE_VERSION,
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
  const started = new Date()
  if (!ARTIST_STEPS.includes(step as ArtistStep)) {
    return { ok: false, status: 400, message: 'That is not a step of the application.' }
  }
  const name = step as ArtistStep
  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no artist application to save.' }
  if (!EDITABLE.includes(application.stage)) {
    return {
      ok: false,
      status: 409,
      message: 'This application has been sent, so it can no longer be changed.',
    }
  }

  const parsed = ARTIST_STEP_SCHEMAS[name].safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      message: 'A few things need another look. They are marked below.',
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
      return { ok: false, status: 422, message: 'Each work needs its own photograph.' }
    }
  }

  // The last step asks only for consent to the privacy policy, in so many words (I AGREE typed).
  // The terms of working together are signed after approval (src/agreements).
  if (name === 'review') {
    const review = parsed.data as { agreeTyped?: string }
    if (!agreedInWords(review.agreeTyped)) {
      return {
        ok: false,
        status: 422,
        message: 'A few things need another look. They are marked below.',
        errors: { agreeTyped: AGREE_LINE },
      }
    }
  }

  const completed = new Set(application.completedSteps ?? [])
  completed.add(name)
  const fields = toFields(name, parsed.data as Record<string, unknown>)
  // Consent is given in step 1; the time kept is when it was first given, not every later save
  if (name === 'about') {
    fields.about = {
      ...fields.about,
      consentedAt: application.about?.consentProcessing
        ? (application.about.consentedAt ?? new Date().toISOString())
        : new Date().toISOString(),
    } as never
  }
  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: { ...fields, completedSteps: [...completed] },
    depth: 1,
    ...asMember(member),
    context: { disableRevalidate: true },
  })
  // Only the pictures in the works on screen are kept; the rest are deleted now
  if (name === 'portfolio') await discardUnkeptPictures(payload, member, started)
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
  evidence: ConsentEvidence,
  given: { checked: boolean; typed: string | null | undefined },
): Promise<Application> => {
  const ip = evidence.ip
  // Each sending adds a row to the consent record; the rows before it are kept as they are
  const kept = application.consentRecord ?? []
  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: {
      stage: 'submitted',
      submittedAt: new Date().toISOString(),
      consentRecord: [...kept, consentRow(evidence, given)],
    },
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
  evidence: ConsentEvidence,
): Promise<SaveResult> => {
  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no artist application to send.' }
  if (!EDITABLE.includes(application.stage)) {
    return { ok: false, status: 409, message: 'This application has already been sent.' }
  }
  const problems = artistProblems(application)
  const declarations = application.declarations as
    { agreeTyped?: string | null; consentProcessing?: boolean | null } | undefined
  if (!agreedInWords(declarations?.agreeTyped)) {
    problems.review = { ...problems.review, agreeTyped: AGREE_LINE }
  }
  // Identity is no longer part of the application: it is asked for after approval
  if (Object.keys(problems).length > 0) {
    const errors = Object.fromEntries(
      Object.entries(problems).flatMap(([step, fields]) =>
        Object.entries(fields).map(([field, message]) => [`${step}.${field}`, message]),
      ),
    )
    return {
      ok: false,
      status: 422,
      message: 'Some steps are not finished yet. They are marked in the list of steps above.',
      errors,
    }
  }
  await discardUnkeptPictures(payload, member, new Date())
  return {
    ok: true,
    application: await submit(payload, member, application, evidence, {
      checked: application.about?.consentProcessing === true,
      typed: declarations?.agreeTyped,
    }),
  }
}

/** What the trade form sends: its answers, consent with I AGREE, and that the details are true */
export type PartnerSubmission = {
  data?: unknown
  /** The box under "How we use your details" ticked and I AGREE typed, every time */
  consent?: { checked?: unknown; typed?: unknown }
  /** "The details I have given are true and complete." */
  accurate?: unknown
}

/** The answers a trade applicant may keep in a draft: text only, trimmed, at most its length */
const TRADE_DRAFT_FIELDS: Record<string, number> = {
  subType: 60,
  fullName: 120,
  role: 120,
  organisation: 160,
  phone: 30,
  country: 80,
  city: 80,
  state: 80,
  website: 300,
  gstin: 30,
  proof: 300,
  interest: 600,
  message: 2000,
}

/**
 * "Save and finish later": keeps what the trade form holds, as typed, without checking it, so
 * the applicant can come back to it. Everything is checked when it is sent.
 */
export const savePartnerDraft = async (
  payload: Payload,
  member: Member,
  data: unknown,
): Promise<SaveResult> => {
  const application = await findOwnApplication(payload, member, 'partner', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no trade application to save.' }
  if (!EDITABLE.includes(application.stage)) {
    return {
      ok: false,
      status: 409,
      message: 'This application has been sent, so it can no longer be changed.',
    }
  }
  const given = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const partner = Object.fromEntries(
    Object.entries(TRADE_DRAFT_FIELDS).map(([key, max]) => [
      key,
      typeof given[key] === 'string' ? (given[key] as string).trim().slice(0, max) || null : null,
    ]),
  )
  const saved = await payload.update({
    collection: 'applications',
    id: application.id,
    data: { partner: partner as never },
    depth: 0,
    ...asMember(member),
    context: { disableRevalidate: true },
  })
  return { ok: true, application: saved }
}

/**
 * Sends a trade application in one go: the form is a single page (the ApplyPartner design).
 * Everything is checked first and every problem listed at once: the answers, consent to how the
 * details are used with I AGREE typed, and that the details are true. No identity documents are
 * asked for now: those come after approval, before the trade agreement.
 */
export const submitPartnerApplication = async (
  payload: Payload,
  member: Member,
  submission: PartnerSubmission | null,
  evidence: ConsentEvidence,
): Promise<SaveResult> => {
  const application = await findOwnApplication(payload, member, 'partner', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no trade application to send.' }
  if (!EDITABLE.includes(application.stage)) {
    return { ok: false, status: 409, message: 'This application has already been sent.' }
  }
  const errors: Record<string, string> = {}
  const parsed = partnerSchema.safeParse(submission?.data)
  if (!parsed.success) Object.assign(errors, fieldErrors(parsed.error))

  const consent = submission?.consent
  if (consent?.checked !== true)
    errors.consent =
      'Please tick the box to give your consent, so that we can check your details and, if we work together, pay you.'
  if (!agreedInWords(consent?.typed)) errors.consentTyped = AGREE_LINE
  if (submission?.accurate !== true)
    errors.accurate = 'Please confirm that the information is accurate.'

  if (Object.keys(errors).length > 0 || !parsed.success) {
    return {
      ok: false,
      status: 422,
      message: 'A few things need another look. They are marked below.',
      errors,
    }
  }

  await payload.update({
    collection: 'applications',
    id: application.id,
    // A trade account is always the placement kind: designers, architects, advisers, dealers
    data: { partner: parsed.data, partnerCategory: 'placement' },
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
        accurate: true,
        privacyNoticeVersion: TRADE_NOTICE_VERSION,
      },
    },
    depth: 0,
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(member, 'members') },
  })
  return {
    ok: true,
    application: await submit(payload, member, saved, evidence, {
      checked: true,
      typed: typeof consent?.typed === 'string' ? consent.typed : null,
    }),
  }
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
