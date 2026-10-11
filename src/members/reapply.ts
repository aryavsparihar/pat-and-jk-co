import type { Payload } from 'payload'

import type { Application, Member, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'
import { publicError } from '@/utilities/publicError'

import type { MemberKind } from './ids'
import { defaultSiteSettings } from './openness'

/**
 * Applying again after a decline. The same application reopens, with the same reference: the
 * first three steps come back filled in, to review; the work and identity start fresh (identity
 * details are deleted, as they would be 90 days after a decline anyway). The earlier decision is
 * kept in the application's history. A wait, six months unless Site settings says otherwise,
 * runs from the decision; staff can end it early.
 */

export const DEFAULT_REAPPLY_MONTHS = 6

/** The steps that come back filled in */
const KEPT_STEPS = ['about', 'address', 'practice']

export const reapplyMonths = async (payload: Payload): Promise<number> => {
  const months = (await defaultSiteSettings(payload))?.reapplyAfterMonths
  return typeof months === 'number' && months >= 0 ? months : DEFAULT_REAPPLY_MONTHS
}

/** The day, months after `from`, on which someone may apply again */
export const reapplyFrom = (months: number, from = new Date()): string => {
  const date = new Date(from)
  date.setMonth(date.getMonth() + months)
  return date.toISOString()
}

export const canReapply = (
  application: Pick<Application, 'stage'> & { reapplyFrom?: string | null },
  now = new Date(),
) =>
  application.stage === 'rejected' &&
  Boolean(application.reapplyFrom) &&
  new Date(application.reapplyFrom!).getTime() <= now.getTime()

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

/** The applicant applies again: the same application, reopened */
export const reopenApplication = async (
  payload: Payload,
  member: Member,
  type: MemberKind,
): Promise<Application> => {
  // Loaded here, not at the top: decide.ts (and so the Payload config) imports this file, and
  // the KYC service is server-only
  const { findOwnApplication } = await import('./application')
  const { purgeKyc } = await import('@/kyc/service')
  const application = (await findOwnApplication(payload, member, type, 0)) as
    (Application & { reapplyFrom?: string | null; rounds?: unknown[] | null }) | null
  if (!application) throw publicError('There is no application to open again.', 404)
  if (application.stage !== 'rejected')
    throw publicError('This application is not one that was declined.', 409)
  if (!canReapply(application)) throw publicError('It is not yet time to apply again.', 409)

  const rounds = [
    ...((application.rounds as Record<string, unknown>[] | null) ?? []).map(
      ({ id: _id, ...round }) => round,
    ),
    {
      decision: 'rejected',
      submittedAt: application.submittedAt ?? null,
      decidedAt: application.decidedAt ?? null,
      note: application.decisionNote ?? null,
    },
  ]
  const kept = (application.completedSteps ?? []).filter((s) => KEPT_STEPS.includes(s))
  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: {
      stage: 'draft',
      rounds,
      completedSteps: type === 'artist' ? kept : [],
      decisionNote: null,
      decidedAt: null,
      decidedBy: null,
      submittedAt: null,
      reapplyFrom: null,
      ...(type === 'artist' ? { portfolio: [], declarations: {}, identityCode: null } : {}),
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true, reopeningApplication: true },
  })
  if (type === 'artist') {
    await purgeKyc(payload, {
      memberId: member.id,
      reason: 'Applying again: identity starts fresh',
    })
  }
  await logSecurityEvent(payload, {
    event: 'application-reopened',
    email: member.email,
    subject: application.reference,
    detail: `${type}, round ${rounds.length + 1}`,
  })
  return updated
}
