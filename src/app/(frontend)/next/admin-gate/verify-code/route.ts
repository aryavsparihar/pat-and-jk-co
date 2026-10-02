import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { checkChallenge } from '@/security/challenges'
import { clientIp, GATE_COOKIE, GATE_TTL_SECONDS, normaliseEmail } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { createGateToken } from '@/security/gateToken'

export const dynamic = 'force-dynamic'

// A function, not a shared Response: a response body can only be read once, so one object
// returned to every failed attempt breaks from the second failure on
const rejected = () =>
  Response.json(
    { message: 'That code is not right, or it has expired. Ask for a new one.' },
    { status: 401 },
  )

/**
 * Step two: check the code and, if it is good, set the short-lived gate cookie that
 * `proxy.ts` looks for before letting anyone reach /admin or the auth API.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)

  let challengeId: unknown
  let code: unknown
  try {
    const body = (await request.json()) as { challengeId?: string | number; code?: string }
    challengeId = body.challengeId
    code = body.code
  } catch {
    return rejected()
  }

  // Attempts are reserved and codes spent atomically (src/security/challenges.ts)
  const result = await checkChallenge(payload, { challengeId, code, audience: 'staff' })

  if (!result.ok) {
    if (result.reason !== 'missing') {
      await logSecurityEvent(payload, {
        event: 'code-failed',
        email: normaliseEmail(result.email),
        ip,
        detail: {
          expired: 'expired',
          spent: 'already used',
          'too-many-attempts': 'too many attempts',
          'wrong-code': 'wrong code',
        }[result.reason],
      })
    }
    return rejected()
  }

  const email = normaliseEmail(result.email)

  // The account must still be active at this moment, not just when the code was sent
  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  if (users.docs[0]?.status !== 'active') {
    await logSecurityEvent(payload, {
      event: 'login-blocked',
      email,
      ip,
      detail: 'account not active',
    })
    return rejected()
  }

  const { token, jti } = createGateToken(email)
  const jar = await cookies()
  jar.set(GATE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GATE_TTL_SECONDS,
  })

  await logSecurityEvent(payload, { event: 'code-verified', email, ip, detail: jti })

  return Response.json({ ok: true, email })
}
