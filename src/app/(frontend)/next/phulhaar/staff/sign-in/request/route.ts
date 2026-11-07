import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { json, phulhaarConfig, readSigned } from '@/phulhaar/protocol'
import { activeStaff } from '@/phulhaar/people'
import { issueChallenge } from '@/security/challenges'
import { clientIp, isEmail, normaliseEmail } from '@/security/constants'
import { sendSignInCode } from '@/security/email'
import { logSecurityEvent } from '@/security/events'
import { hitLimits } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** The only domain whose staff may run Phulhaar's admin. Phulhaar refuses any other as well. */
const STAFF_DOMAIN = (process.env.ADMIN_EMAIL_DOMAIN ?? 'pjk.co.in').toLowerCase()

/**
 * Phulhaar staff step one: email a code to a member of PJK staff. The reply is the same whether
 * or not the address is staff, so this cannot be used to find staff addresses.
 */
export async function POST(request: Request) {
  const config = phulhaarConfig()
  if (!config) return json({ code: 'not_configured' }, 503)
  const signed = await readSigned<{ email: string }>(request, config)
  if (!signed.ok) return signed.response

  const email = normaliseEmail(signed.body.email)
  if (!isEmail(email)) return json({ code: 'malformed_email' }, 400)

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)

  const limit = await hitLimits(payload, [
    { scope: 'phulhaar-staff-code-email', subject: email, max: 5, windowSeconds: 3600 },
    { scope: 'phulhaar-code-all', subject: 'phulhaar', max: 100, windowSeconds: 3600 },
  ])
  if (!limit.allowed) {
    await logSecurityEvent(payload, { event: 'code-rate-limited', email, ip, detail: 'phulhaar' })
    return json({ code: 'rate_limited' }, 429, { 'Retry-After': String(limit.retryAfter) })
  }

  const user = email.endsWith(`@${STAFF_DOMAIN}`) ? await activeStaff(payload, email) : null
  const challenge = await issueChallenge(payload, {
    email,
    ip,
    audience: 'staff',
    deliverable: Boolean(user),
  })
  await logSecurityEvent(payload, {
    event: 'code-requested',
    email,
    ip,
    detail: `phulhaar: ${user ? 'code sent' : 'not active staff'}`,
  })

  if (user) {
    const sent = await sendSignInCode(payload, { email, code: challenge.code })
    if (sent) await logSecurityEvent(payload, { event: 'code-sent', email, ip, detail: 'phulhaar' })
  }

  return json({ challengeId: String(challenge.id) })
}
