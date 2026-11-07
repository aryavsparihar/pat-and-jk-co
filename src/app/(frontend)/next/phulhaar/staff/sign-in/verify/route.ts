import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { json, phulhaarConfig, readSigned, signToken } from '@/phulhaar/protocol'
import { activeStaff, phulhaarRole } from '@/phulhaar/people'
import { checkChallenge } from '@/security/challenges'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'

export const dynamic = 'force-dynamic'

/** Phulhaar staff step two: check the code, and answer with a signed token naming the staff member. */
export async function POST(request: Request) {
  const config = phulhaarConfig()
  if (!config) return json({ code: 'not_configured' }, 503)
  const signed = await readSigned<{ challengeId: string; code: string }>(request, config)
  if (!signed.ok) return signed.response

  const id = typeof signed.body.challengeId === 'string' ? signed.body.challengeId : ''
  if (!/^\d{1,12}$/.test(id)) return json({ code: 'challenge_expired' }, 400)

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)
  const result = await checkChallenge(payload, {
    challengeId: Number(id),
    code: signed.body.code,
    audience: 'staff',
  })

  if (!result.ok) {
    await logSecurityEvent(payload, {
      event: 'code-failed',
      email: result.email,
      ip,
      detail: `phulhaar: ${result.reason}`,
    })
    if (result.reason === 'too-many-attempts') return json({ code: 'too_many_attempts' }, 429)
    if (result.reason === 'wrong-code') return json({ code: 'bad_code' }, 400)
    return json({ code: 'challenge_expired' }, 400)
  }

  // Still staff now, not only when the code was sent
  const user = await activeStaff(payload, result.email)
  if (!user) return json({ code: 'bad_code' }, 400)

  await logSecurityEvent(payload, {
    event: 'code-verified',
    email: result.email,
    ip,
    detail: 'phulhaar',
  })
  const token = signToken(
    {
      sub: String(user.id),
      email: result.email,
      name: user.name?.trim() || result.email,
      role: phulhaarRole(user),
      kind: 'staff',
    },
    config.signingKey,
  )
  return json({ token })
}
