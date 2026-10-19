import type { Payload } from 'payload'

import type { Application, Member } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'
import { publicError } from '@/utilities/publicError'

import type { MemberKind } from './ids'
import { WITHDRAWABLE } from './stages'
import { actingFor } from '@/security/audit'

/**
 * The applicant withdraws their current application of a kind, at any point before it is decided.
 * It stays on record as withdrawn, for staff and for them. An artist's identity details are
 * deleted at once: they told us they no longer want to go ahead, so we no longer need them. They
 * may apply again whenever they like, with their other answers filled in (src/members/reapply.ts).
 */
export const withdrawApplication = async (
  payload: Payload,
  member: Member,
  type: MemberKind,
): Promise<Application> => {
  const { findOwnApplication } = await import('./application')
  const application = await findOwnApplication(payload, member, type, 0)
  if (!application) throw publicError('There is no application to withdraw.', 404)
  if (!WITHDRAWABLE.includes(application.stage))
    throw publicError('This application can no longer be withdrawn.', 409)

  const updated = await payload.update({
    collection: 'applications',
    id: application.id,
    data: { stage: 'withdrawn', withdrawnAt: new Date().toISOString() } as never,
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(member, 'members') },
  })
  if (type === 'artist') {
    const { purgeKyc } = await import('@/kyc/service')
    await purgeKyc(payload, {
      memberId: member.id,
      reason: `Application ${application.reference} withdrawn by the applicant`,
    })
  }
  await logSecurityEvent(payload, {
    event: 'application-withdrawn',
    email: member.email,
    subject: application.reference,
    detail: `${type}, was ${application.stage}`,
  })
  // Staff hear of it if they might have been reading it
  if (application.stage !== 'draft') {
    const { notifyStaffOfWithdrawal } = await import('./emails')
    await notifyStaffOfWithdrawal(payload, { application: updated })
  }
  return updated
}
