import type { Payload, PayloadRequest } from 'payload'

import type { Member } from '@/payload-types'

/**
 * A member's standing, and what each allows (docs/ADMIN_GUIDE.md, "Suspending someone, or putting
 * them on hold"):
 *
 *   active      everything
 *   on-hold     signs in and sees their account, but changes nothing, and payouts are paused
 *   suspended   cannot sign in at all; every session ends at once
 *   erased      deleted (src/people/erase.ts), never set here
 *
 * Staff change it only with a written reason, through POST /api/members/:id/standing, so every
 * change is in the security log with who made it and why.
 */
export type Standing = Member['standing']

export const STAFF_STANDINGS = ['active', 'on-hold', 'suspended'] as const
export type StaffStanding = (typeof STAFF_STANDINGS)[number]

/** May sign in and keep a session */
export const canSignIn = (standing: Standing | null | undefined) =>
  standing === 'active' || standing === 'on-hold'

/** May change anything in their account or applications */
export const canChange = (standing: Standing | null | undefined) => standing === 'active'

export const ON_HOLD_MESSAGE =
  'Your account is on hold, so nothing can be changed for now. Please write to hello@pjk.co.in.'

export const PAYOUTS_PAUSED_MESSAGE =
  'This account is on hold: payouts and payout details are paused until it is released.'

const MIN_REASON = 10

export class StandingError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}

/**
 * Suspends someone, puts them on hold, or restores them. The reason is kept on their record (for
 * other staff to see why) and in the security log, written by the Members afterChange hook.
 */
export const changeStanding = async (
  payload: Payload,
  {
    memberId,
    standing,
    reason,
    req,
  }: { memberId: number; standing: unknown; reason: unknown; req: PayloadRequest },
): Promise<Member> => {
  if (!STAFF_STANDINGS.includes(standing as StaffStanding))
    throw new StandingError('Choose active, on hold or suspended.', 400)
  const why = typeof reason === 'string' ? reason.trim() : ''
  if (why.length < MIN_REASON)
    throw new StandingError('Give a reason of at least ten characters.', 400)

  const member = await payload
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!member) throw new StandingError('There is no such member.', 404)
  if (member.standing === 'erased')
    throw new StandingError('This person has been deleted; their record cannot change.', 409)
  if (member.standing === standing) throw new StandingError('They already have that standing.', 409)

  return payload.update({
    collection: 'members',
    id: memberId,
    data: {
      standing: standing as StaffStanding,
      standingReason: standing === 'active' ? null : why.slice(0, 1000),
      standingChangedAt: new Date().toISOString(),
    },
    overrideAccess: true,
    // The staff member's own request, so the log names them; the afterChange hook writes the
    // reason there too
    req,
    context: { standingReason: why.slice(0, 400) },
  })
}
