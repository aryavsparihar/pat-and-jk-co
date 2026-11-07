import type { Payload } from 'payload'

import type { Member, User } from '@/payload-types'

/** The member who holds this artist (AT…) or partner (PT…) ID, if anyone does. */
export const memberByPublicId = async (
  payload: Payload,
  memberId: string,
): Promise<Member | null> => {
  const found = await payload.find({
    collection: 'members',
    where: { or: [{ artistId: { equals: memberId } }, { partnerId: { equals: memberId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}

export const holdsId = (member: Member, memberId: string) =>
  member.artistId === memberId || member.partnerId === memberId

/** An active staff account with this address, if there is one. */
export const activeStaff = async (payload: Payload, email: string): Promise<User | null> => {
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const user = found.docs[0]
  return user && user.status === 'active' ? user : null
}

/** Phulhaar knows two staff roles: a super admin is its admin, everyone else an editor. */
export const phulhaarRole = (user: User): 'admin' | 'editor' =>
  (user.roles ?? []).includes('super-admin') ? 'admin' : 'editor'
