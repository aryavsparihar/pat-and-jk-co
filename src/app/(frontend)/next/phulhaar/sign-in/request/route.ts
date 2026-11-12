import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { MEMBER_ID_PATTERN } from '@/members/ids'
import { sendMemberCode } from '@/members/emails'
import { artistChallengeId, json, phulhaarConfig, readSigned } from '@/phulhaar/protocol'
import { memberByPublicId } from '@/phulhaar/people'
import { issueChallenge } from '@/security/challenges'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { hitLimits } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * Phulhaar step one: email a one-time code to the artist who holds this Artist ID.
 *
 * Signed by Phulhaar's server. The reply is the same whether or not the ID belongs to anyone,
 * because Artist IDs are sequential: an unknown ID gets a challenge with nobody behind it, which
 * simply never accepts a code. A suspended artist is sent a code too, and refused at the next
 * step with a clear reason.
 */
export async function POST(request: Request) {
  const config = phulhaarConfig()
  if (!config) return json({ code: 'not_configured' }, 503)
  const signed = await readSigned<{ artistId: string }>(request, config)
  if (!signed.ok) return signed.response

  const memberId =
    typeof signed.body.artistId === 'string' ? signed.body.artistId.trim().toUpperCase() : ''
  if (!MEMBER_ID_PATTERN.test(memberId)) return json({ code: 'malformed_artist_id' }, 400)

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)

  const limit = await hitLimits(payload, [
    { scope: 'phulhaar-code-id-hour', subject: memberId, max: 5, windowSeconds: 3600 },
    { scope: 'phulhaar-code-id-minute', subject: memberId, max: 1, windowSeconds: 60 },
    { scope: 'phulhaar-code-all', subject: 'phulhaar', max: 100, windowSeconds: 3600 },
  ])
  if (!limit.allowed) {
    await logSecurityEvent(payload, {
      event: 'member-code-rate-limited',
      ip,
      detail: `phulhaar: ${memberId}`,
    })
    return json({ code: 'rate_limited' }, 429, { 'Retry-After': String(limit.retryAfter) })
  }

  const member = await memberByPublicId(payload, memberId)
  const email = member?.email ?? null
  const deliverable = Boolean(email && member?.standing !== 'erased')

  const challenge = await issueChallenge(payload, {
    // A challenge nobody can answer still needs an address; this one can never receive mail
    email: deliverable && email ? email : `${memberId.toLowerCase()}@phulhaar.invalid`,
    ip,
    audience: 'member',
    purpose: 'signin',
    deliverable,
  })

  await logSecurityEvent(payload, {
    event: 'member-code-requested',
    email: deliverable && email ? email : undefined,
    ip,
    subject: memberId,
    detail: `phulhaar: ${deliverable ? 'code sent' : member ? `refused, ${member.standing}` : 'no member'}`,
  })

  if (deliverable && email) {
    const sent = await sendMemberCode(payload, { email, code: challenge.code, purpose: 'signin' })
    if (sent) {
      await logSecurityEvent(payload, { event: 'member-code-sent', email, ip, detail: 'phulhaar' })
    }
  }

  return json({ challengeId: artistChallengeId(challenge.id, memberId) })
}
