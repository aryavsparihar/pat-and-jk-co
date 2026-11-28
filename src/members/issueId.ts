import type { Payload } from 'payload'

import type { Member } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'

import { newMemberId, type MemberKind } from './ids'

/**
 * Member IDs (AT-, PT-) are issued once, when the agreement is signed (founder's brief of 25
 * November 2026, section 11), and never by hand: the Members collection refuses any change to an
 * ID that does not come through here (context.issuingMemberId).
 *
 * Approval no longer issues one. Between approval and signing the applicant is known by their
 * application number (AA-, PA-), confirms who they are, and waits for the team to check it.
 */

export const idFieldOf = (kind: MemberKind) => (kind === 'artist' ? 'artistId' : 'partnerId')

/**
 * Draws a new random member ID of a kind (AT-X63G8) that no one has, deleted people included.
 * With 20 million IDs of each kind a clash is rare; ten in a row means something is wrong, so it
 * stops rather than loop. The unique index on the column is the final word if two are drawn at
 * once: issueMemberId tries again.
 */
export const nextMemberId = async (payload: Payload, kind: MemberKind): Promise<string> => {
  const field = idFieldOf(kind)
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = newMemberId(kind)
    const taken = await payload.count({
      collection: 'members',
      where: { [field]: { equals: candidate } },
      overrideAccess: true,
    })
    if (taken.totalDocs === 0) return candidate
  }
  throw new Error(`Could not find an unused ${kind} member ID`)
}

/**
 * Gives the member their ID of this kind, if they have none yet, and returns it. Someone who
 * already has one (an artist signing again after a new agreement version) keeps it. Labels their
 * identity record with it and logs the issue.
 */
export const issueMemberId = async (
  payload: Payload,
  member: Member,
  kind: MemberKind,
  { reference }: { reference?: string | null } = {},
): Promise<{ id: string; member: Member; issued: boolean }> => {
  const field = idFieldOf(kind)
  if (member[field]) return { id: member[field]!, member, issued: false }

  for (let attempt = 0; ; attempt++) {
    const candidate = await nextMemberId(payload, kind)
    try {
      const updated = await payload.update({
        collection: 'members',
        id: member.id,
        data: { [field]: candidate },
        overrideAccess: true,
        context: { issuingMemberId: field, disableRevalidate: true },
      })
      const { labelKycRecord } = await import('@/kyc/service')
      await labelKycRecord(payload, updated)
      await logSecurityEvent(payload, {
        event: 'member-id-issued',
        email: updated.email,
        subject: candidate,
        detail: reference ? `${reference}, on signing the agreement` : 'On signing the agreement',
      })
      return { id: candidate, member: updated, issued: true }
    } catch (error) {
      // Drawn by someone else in the same moment: draw again
      if (attempt < 4 && /unique|duplicate/i.test(String((error as Error)?.message))) continue
      throw error
    }
  }
}
