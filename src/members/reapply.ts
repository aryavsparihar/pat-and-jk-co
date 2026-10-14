import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import type { Application, Member, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'
import { publicError } from '@/utilities/publicError'

import { currentSlot } from './accounts'
import { newApplicationReference, type MemberKind } from './ids'
import { defaultSiteSettings } from './openness'

/**
 * Applying again, after a decline (once the wait is over) or a withdrawal (at any time). Each
 * attempt is an application of its own, with its own reference and record, pointing back to the
 * one before; the earlier one is left exactly as it was decided, and staff see the whole history.
 *
 * The new application starts with the person's earlier answers filled in, to review: about them,
 * where they live, their practice and their works (for an artist), or everything they wrote (for a
 * partner). Their identity documents and identity photo are given again; what they typed about
 * their identity stays if it is still held (src/kyc/service.ts, clearIdentityEvidence).
 *
 * The wait after a decline is set in Site settings (90 days unless changed) and runs from the
 * decision; staff can end it early.
 */

export const DEFAULT_REAPPLY_DAYS = 90

const DAY = 86_400_000

/** The steps of an artist application that come back filled in */
const KEPT_STEPS = ['about', 'address', 'practice', 'portfolio']

export const reapplyDays = async (payload: Payload): Promise<number> => {
  const days = (await defaultSiteSettings(payload))?.reapplyAfterDays
  return typeof days === 'number' && days >= 0 ? days : DEFAULT_REAPPLY_DAYS
}

/** The moment, `days` after `from`, from which someone may apply again */
export const reapplyFrom = (days: number, from: Date | string = new Date()): string =>
  new Date(new Date(from).getTime() + days * DAY).toISOString()

/** May this person start a new application in place of this one, now? */
export const canReapply = (
  application: Pick<Application, 'stage'> & { reapplyFrom?: string | null },
  now = new Date(),
) =>
  application.stage === 'withdrawn' ||
  (application.stage === 'rejected' &&
    Boolean(application.reapplyFrom) &&
    new Date(application.reapplyFrom!).getTime() <= now.getTime())

/** Staff end the wait early, with their name in the security log */
export const allowReapplyNow = async (
  payload: Payload,
  { applicationId, actor }: { applicationId: number; actor: User },
): Promise<Application> => {
  const application = await payload.findByID({
    collection: 'applications',
    id: applicationId,
    depth: 0,
    overrideAccess: true,
  })
  if (application.stage !== 'rejected')
    throw publicError('Only a declined application can be opened again.', 409)
  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: { reapplyFrom: new Date().toISOString() } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await logSecurityEvent(payload, {
    event: 'application-reapply-allowed',
    actor: actor.id,
    subject: application.reference,
    detail: `Allowed to apply again now by ${actor.email}`,
  })
  return updated
}

/**
 * A copy of an answer without the row ids Payload gives each entry of a list (an exhibition, a
 * link, a work), which belong to the earlier application's rows and cannot be reused
 */
const withoutRowIds = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== 'object') return item
      const { id: _id, ...rest } = item as Record<string, unknown>
      return withoutRowIds(rest)
    }) as T
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, withoutRowIds(v)]),
    ) as T
  }
  return value
}

/** What carries over from one application to the next */
const carriedOver = async (
  payload: Payload,
  member: Member,
  earlier: Application,
): Promise<Partial<Application>> => {
  if (earlier.type === 'partner') {
    return { partner: withoutRowIds(earlier.partner), partnerCategory: earlier.partnerCategory }
  }
  // Works whose pictures are still this person's; a work whose picture has gone is left out
  const works = withoutRowIds(earlier.portfolio ?? [])
  const ids = works.map((w) => (typeof w.image === 'object' ? w.image?.id : w.image))
  const owned = ids.length
    ? (
        await payload.find({
          collection: 'portfolio-images',
          where: { and: [{ id: { in: ids } }, { owner: { equals: member.id } }] },
          limit: ids.length,
          depth: 0,
          overrideAccess: true,
        })
      ).docs.map((d) => d.id)
    : []
  const portfolio = works.filter((_, i) => owned.includes(ids[i] as number))
  const completed = (earlier.completedSteps ?? []).filter(
    (s) => KEPT_STEPS.includes(s) && (s !== 'portfolio' || portfolio.length === works.length),
  )
  return {
    about: withoutRowIds(earlier.about),
    address: withoutRowIds(earlier.address),
    practice: withoutRowIds(earlier.practice),
    portfolio,
    completedSteps: completed,
  }
}

/** Starts a new application of a kind, following the person's declined or withdrawn one */
export const applyAgain = async (
  payload: Payload,
  member: Member,
  type: MemberKind,
): Promise<Application> => {
  // Loaded here, not at the top: decide.ts (and so the Payload config) imports this file, and
  // the KYC service is server-only
  const { findOwnApplication } = await import('./application')
  const earlier = await findOwnApplication(payload, member, type, 0)
  if (!earlier) throw publicError('There is no application to follow.', 404)
  if (earlier.stage !== 'rejected' && earlier.stage !== 'withdrawn')
    throw publicError('Your current application is still open.', 409)
  if (!canReapply(earlier)) throw publicError('It is not yet time to apply again.', 409)

  const kept = await carriedOver(payload, member, earlier)
  let created: Application | undefined
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      // The earlier one stops being current and the new one takes its place, together
      await payload.update({
        collection: 'applications',
        id: earlier.id,
        data: { currentSlot: null } as never,
        overrideAccess: true,
        req,
        context: { disableRevalidate: true },
      })
      created = await payload.create({
        collection: 'applications',
        data: {
          ...kept,
          reference: newApplicationReference(type),
          member: member.id,
          type,
          stage: 'draft',
          previousApplication: earlier.id,
          currentSlot: currentSlot(member.id, type),
        } as never,
        overrideAccess: true,
        req,
        context: { disableRevalidate: true },
      })
      await commitTransaction(req)
    } catch (error) {
      await killTransaction(req)
      created = undefined
      // A reference already taken: try another. Anything else, a second request that got there
      // first among them, stops here
      if (!/reference/i.test(String((error as Error)?.message)) || attempt === 4) throw error
    }
  }

  if (type === 'artist') {
    const { clearIdentityEvidence } = await import('@/kyc/service')
    await clearIdentityEvidence(payload, {
      memberId: member.id,
      reason: `Applying again (${created!.reference}): documents and photo given afresh`,
    })
  }
  await logSecurityEvent(payload, {
    event: 'application-reopened',
    email: member.email,
    subject: created!.reference,
    detail: `${type}, follows ${earlier.reference} (${earlier.stage})`,
  })
  return created!
}
