import type { Payload } from 'payload'

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
  const found = await payload.find({
    collection: 'applications',
    where: { and: [{ member: { equals: member.id } }, { type: { equals: type } }] },
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
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        } as never,
      }
  }
}

/** What is stored, put back into the shape a step's schema checks */
export const fromFields = (step: ArtistStep, app: Application): Record<string, unknown> => {
  const idOf = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : v)
  switch (step) {
    case 'about':
      return { ...app.about, dateOfBirth: app.about?.dateOfBirth?.slice(0, 10) }
    case 'address':
      return {
        residence: app.address?.residence,
        correspondenceSame: app.address?.correspondenceSame ?? true,
        correspondence: app.address?.correspondence,
      }
    case 'practice':
      return { ...app.practice, recognition: app.practice?.recognition ?? [] }
    case 'portfolio':
      return {
        works: (app.portfolio ?? []).map(({ id: _id, ...work }) => ({
          ...work,
          image: idOf(work.image),
        })),
      }
    case 'review':
      return { ...app.declarations }
  }
}

const strip = (value: unknown): unknown => {
  // Payload returns nulls for empty optional fields; the schemas expect them absent
  if (Array.isArray(value)) return value.map(strip)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, v]) => v !== null && key !== 'id')
        .map(([key, v]) => [key, strip(v)]),
    )
  }
  return value
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

  const completed = new Set(application.completedSteps ?? [])
  completed.add(name)
  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: {
      ...toFields(name, parsed.data as Record<string, unknown>),
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
    const parsed = ARTIST_STEP_SCHEMAS[step].safeParse(strip(fromFields(step, application)))
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

/** Saves and sends a partner application in one go: the form is a single page. */
export const submitPartnerApplication = async (
  payload: Payload,
  member: Member,
  data: unknown,
  ip: string,
): Promise<SaveResult> => {
  const application = await findOwnApplication(payload, member, 'partner', 0)
  if (!application)
    return { ok: false, status: 404, message: 'There is no partner application to send.' }
  if (!EDITABLE.includes(application.stage)) {
    return { ok: false, status: 409, message: 'This application has already been sent.' }
  }
  const parsed = partnerSchema.safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      status: 422,
      message: 'A few things need another look.',
      errors: fieldErrors(parsed.error),
    }
  }
  const { category, ...partner } = parsed.data
  const saved = await payload.update({
    collection: 'applications',
    id: application.id,
    data: { partner, partnerCategory: category },
    depth: 0,
    ...asMember(member),
    context: { disableRevalidate: true },
  })
  return { ok: true, application: await submit(payload, member, saved, ip) }
}
