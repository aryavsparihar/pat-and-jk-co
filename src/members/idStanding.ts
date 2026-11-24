import type { Payload, PayloadRequest } from 'payload'

import type { Member } from '@/payload-types'

import { canSignIn } from './standing'

/**
 * The standing of each ID a member holds, apart from the member's own standing (the founder's
 * request of 22 November 2026: one email can hold an Artist ID and a Trade Partner ID, and staff
 * need to suspend or remove one without touching the other).
 *
 *   active      the account for this ID works as normal
 *   suspended   the account for this ID is closed until staff restore it
 *   removed     the ID is retired for good: never restored, never issued again. The records of
 *               the approval and of any payments stay, as the law requires. For an artist, the
 *               public profile is taken down
 *
 * The member's own standing (src/members/standing.ts) still covers the whole person: on hold or
 * suspended there applies to every ID. Someone whose every ID is suspended or removed cannot sign
 * in at all.
 */

export type Role = 'artist' | 'partner'
export const ROLES: Role[] = ['artist', 'partner']

export const ID_STANDINGS = ['active', 'suspended', 'removed'] as const
export type IdStanding = (typeof ID_STANDINGS)[number]

export const ROLE = {
  artist: {
    idField: 'artistId',
    group: 'artistAccess',
    label: 'Artist ID',
    account: 'Artist Account',
  },
  partner: {
    idField: 'partnerId',
    group: 'partnerAccess',
    label: 'Trade Partner ID',
    account: 'Trade Program Account',
  },
} as const

type Holder = Partial<
  Pick<Member, 'artistId' | 'partnerId' | 'artistAccess' | 'partnerAccess' | 'standing'>
>

/** The standing of this ID, or null if they do not hold it */
export const idStanding = (member: Holder, role: Role): IdStanding | null => {
  const id = member[ROLE[role].idField]
  if (!id) return null
  return (member[ROLE[role].group]?.standing as IdStanding | null | undefined) ?? 'active'
}

/** They hold this ID and its account is open */
export const roleOpen = (member: Holder, role: Role): boolean =>
  idStanding(member, role) === 'active'

/**
 * May sign in: their own standing allows it, and either they hold no ID yet (an applicant) or at
 * least one of their IDs is open.
 */
export const memberCanSignIn = (member: Holder): boolean => {
  if (!canSignIn(member.standing)) return false
  if (!member.artistId && !member.partnerId) return true
  return ROLES.some((role) => roleOpen(member, role))
}

export class IdStandingError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}

const MIN_REASON = 10

/**
 * Suspends, restores or removes one of a member's IDs, with a reason, logged. Removing is final
 * and for super admins only (checked by the route). If no ID is left open, every session ends.
 */
export const changeIdStanding = async (
  payload: Payload,
  {
    memberId,
    role,
    standing,
    reason,
    req,
  }: { memberId: number; role: unknown; standing: unknown; reason: unknown; req: PayloadRequest },
): Promise<Member> => {
  if (role !== 'artist' && role !== 'partner') throw new IdStandingError('Choose an ID.', 400)
  if (!ID_STANDINGS.includes(standing as IdStanding))
    throw new IdStandingError('Choose active, suspended or removed.', 400)
  const why = typeof reason === 'string' ? reason.trim() : ''
  if (why.length < MIN_REASON)
    throw new IdStandingError('Give a reason of at least ten characters.', 400)

  const member = await payload
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!member) throw new IdStandingError('There is no such member.', 404)
  if (member.standing === 'erased')
    throw new IdStandingError('This person has been deleted; their record cannot change.', 409)
  const before = idStanding(member, role)
  if (!before) throw new IdStandingError(`They do not hold a ${ROLE[role].label}.`, 409)
  if (before === 'removed')
    throw new IdStandingError(`This ${ROLE[role].label} has been removed for good.`, 409)
  if (before === standing) throw new IdStandingError('It already has that standing.', 409)

  const id = member[ROLE[role].idField] as string
  const updated = await payload.update({
    collection: 'members',
    id: memberId,
    data: {
      [ROLE[role].group]: {
        standing: standing as IdStanding,
        reason: standing === 'active' ? null : why.slice(0, 1000),
        changedAt: new Date().toISOString(),
      },
      // A removed artist is no longer shown anywhere
      ...(role === 'artist' && standing === 'removed'
        ? { publicProfile: null, publicProfileAt: null }
        : {}),
    } as never,
    overrideAccess: true,
    req,
    context: { disableRevalidate: true },
  })

  const { logSecurityEvent } = await import('@/security/events')
  const actor = req.user as { id?: number; email?: string; collection?: string } | null
  await logSecurityEvent(payload, {
    event: 'member-standing-changed',
    email: member.email,
    subject: id,
    actor: actor?.collection === 'users' ? (actor.id ?? null) : null,
    detail: `${ROLE[role].label} ${id}: ${before} → ${standing}${actor?.email ? ` by ${actor.email}` : ''}: ${why.slice(0, 400)}`,
    req,
  })

  if (role === 'artist' && standing === 'removed') {
    const { syncPublicImages } = await import('./profile')
    await syncPublicImages(payload, memberId)
  }
  // Nothing left open: they are signed out everywhere, as for a suspension of the whole account
  if (!memberCanSignIn(updated)) {
    const { revokeAllSessions } = await import('@/security/memberSession')
    await revokeAllSessions(payload, memberId, `${ROLE[role].label} ${standing}`)
  }
  return updated
}
