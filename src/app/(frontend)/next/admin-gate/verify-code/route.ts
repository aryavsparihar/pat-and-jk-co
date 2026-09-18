import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import {
  clientIp,
  GATE_COOKIE,
  GATE_TTL_SECONDS,
  normaliseEmail,
  OTP_MAX_ATTEMPTS,
} from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { createGateToken } from '@/security/gateToken'
import { otpMatches } from '@/security/otp'

export const dynamic = 'force-dynamic'

const rejected = Response.json(
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

  let challengeId = ''
  let code = ''
  try {
    const body = (await request.json()) as { challengeId?: string | number; code?: string }
    challengeId = String(body.challengeId ?? '')
    code = String(body.code ?? '').replace(/\D/g, '')
  } catch {
    return rejected
  }
  if (!challengeId || !code) return rejected

  const challenge = await payload
    .findByID({ collection: 'login-challenges', id: challengeId, overrideAccess: true })
    .catch(() => null)

  if (!challenge) return rejected

  const email = normaliseEmail(challenge.email)
  const expired = new Date(challenge.expiresAt).getTime() < Date.now()
  const spent = Boolean(challenge.consumedAt) || (challenge.attempts ?? 0) >= OTP_MAX_ATTEMPTS

  if (expired || spent) {
    await logSecurityEvent(payload, {
      event: 'code-failed',
      email,
      ip,
      detail: expired ? 'expired' : 'too many attempts',
    })
    return rejected
  }

  const good =
    challenge.deliverable && otpMatches(code, String(challenge.id), challenge.codeHash ?? '')

  if (!good) {
    await payload.update({
      collection: 'login-challenges',
      id: challenge.id,
      data: { attempts: (challenge.attempts ?? 0) + 1 },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    await logSecurityEvent(payload, { event: 'code-failed', email, ip, detail: 'wrong code' })
    return rejected
  }

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
    return rejected
  }

  await payload.update({
    collection: 'login-challenges',
    id: challenge.id,
    data: { consumedAt: new Date().toISOString() },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

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
