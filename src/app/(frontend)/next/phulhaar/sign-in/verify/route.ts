import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { findMember } from '@/members/accounts'
import {
  json,
  parseArtistChallengeId,
  phulhaarConfig,
  readSigned,
  signToken,
} from '@/phulhaar/protocol'
import { holdsId } from '@/phulhaar/people'
import { checkChallenge } from '@/security/challenges'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'

export const dynamic = 'force-dynamic'

/**
 * Phulhaar step two: check the code, and answer with a two-minute signed token naming the artist.
 *
 * The token carries the Artist ID, the public display name, the standing and a profile version.
 * Never an email, phone number, address, or any identity or bank detail.
 */
export async function POST(request: Request) {
  const config = phulhaarConfig()
  if (!config) return json({ code: 'not_configured' }, 503)
  const signed = await readSigned<{ challengeId: string; code: string }>(request, config)
  if (!signed.ok) return signed.response

  const challenge = parseArtistChallengeId(signed.body.challengeId)
  if (!challenge) return json({ code: 'challenge_expired' }, 400)

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)
  const result = await checkChallenge(payload, {
    challengeId: challenge.id,
    code: signed.body.code,
    audience: 'member',
  })

  if (!result.ok) {
    await logSecurityEvent(payload, {
      event: 'member-code-failed',
      email: result.email,
      ip,
      subject: challenge.memberId,
      detail: `phulhaar: ${result.reason}`,
    })
    if (result.reason === 'too-many-attempts') return json({ code: 'too_many_attempts' }, 429)
    if (result.reason === 'wrong-code') return json({ code: 'bad_code' }, 400)
    return json({ code: 'challenge_expired' }, 400)
  }

  // Only a Phulhaar sign-in challenge, for the member who holds the ID that was typed
  const member = result.purpose === 'signin' ? await findMember(payload, result.email) : null
  if (!member || !holdsId(member, challenge.memberId)) return json({ code: 'bad_code' }, 400)

  if (member.standing !== 'active') {
    await logSecurityEvent(payload, {
      event: 'member-code-failed',
      email: result.email,
      ip,
      subject: challenge.memberId,
      detail: `phulhaar: refused, ${member.standing}`,
    })
    return json({ code: 'suspended' }, 403)
  }

  const token = signToken(
    {
      sub: challenge.memberId,
      artistId: challenge.memberId,
      displayName: member.displayName?.trim() || challenge.memberId,
      standing: 'active',
      // Rises whenever the member record changes, which is when the public profile can have
      profileVersion: Math.floor(new Date(member.updatedAt).getTime() / 1000),
    },
    config.signingKey,
  )
  return json({ token })
}
