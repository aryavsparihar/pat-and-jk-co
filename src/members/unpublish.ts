import type { Payload } from 'payload'

import { memberIdsOf } from '@/collections/Members'
import type { Member, User } from '@/payload-types'
import { actingFor } from '@/security/audit'
import { logSecurityEvent } from '@/security/events'

import { syncPublicImages } from './profile'

export class UnpublishError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message)
  }
}

/** Marks that a member withdrew consent; staff are then asked to unpublish them */
export const recordConsentWithdrawal = async (payload: Payload, member: Member) => {
  if (member.consentWithdrawal?.withdrawnAt) return false
  await payload.update({
    collection: 'members',
    id: member.id,
    data: { consentWithdrawal: { withdrawnAt: new Date().toISOString() } } as never,
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(member, 'members') },
  })
  return true
}

/**
 * Takes down everything of a member's that the public can see, after they withdrew consent: the
 * approved profile snapshot goes, and every picture of theirs is private again. Phulhaar lists only
 * what PJK has approved and published, so `consentWithdrawal.unpublishedAt` is also what tells
 * Phulhaar to remove their profile and artworks once the two are connected. A profile is not
 * approved again while consent stays withdrawn (src/members/profile.ts).
 */
export const unpublishMember = async (
  payload: Payload,
  { memberId, actor }: { memberId: number; actor: User },
) => {
  const member = await payload
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!member) throw new UnpublishError('That member was not found.', 404)
  if (member.standing === 'erased') throw new UnpublishError('This account has been deleted.')
  if (!member.consentWithdrawal?.withdrawnAt) {
    throw new UnpublishError('They have not withdrawn consent.')
  }
  if (member.consentWithdrawal.unpublishedAt) {
    return { unpublishedAt: member.consentWithdrawal.unpublishedAt }
  }

  const unpublishedAt = new Date().toISOString()
  await payload.update({
    collection: 'members',
    id: memberId,
    data: {
      publicProfile: null,
      publicProfileAt: null,
      consentWithdrawal: {
        withdrawnAt: member.consentWithdrawal.withdrawnAt,
        unpublishedAt,
        unpublishedBy: actor.id,
      },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(actor, 'users') },
  })
  await syncPublicImages(payload, memberId)
  await logSecurityEvent(payload, {
    event: 'profile-unpublished',
    actor: actor.id,
    subject: memberIdsOf(member) ?? `member ${memberId}`,
    detail: 'Profile and artworks unpublished after consent was withdrawn',
  })
  return { unpublishedAt }
}
