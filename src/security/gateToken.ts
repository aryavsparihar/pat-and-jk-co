import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import { GATE_TTL_SECONDS } from './constants'

/**
 * A small signed token proving that someone entered the one-time code sent to their
 * company mailbox. It is checked in `proxy.ts` before any admin page or auth API is reached,
 * so the check costs no database call. Signed with PAYLOAD_SECRET (HMAC-SHA256).
 */

type GatePayload = {
  /** address the code was sent to */
  email: string
  /** seconds since the epoch */
  exp: number
  /** unique id, so a token can be recognised in the audit log */
  jti: string
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

const secret = () => {
  const value = process.env.PAYLOAD_SECRET
  if (!value) throw new Error('PAYLOAD_SECRET is not set — the admin gate cannot sign tokens')
  return value
}

const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url')

export const createGateToken = (email: string): { token: string; jti: string; expiresAt: Date } => {
  const jti = randomUUID()
  const exp = Math.floor(Date.now() / 1000) + GATE_TTL_SECONDS
  const body = encode({ email, exp, jti } satisfies GatePayload)
  return { token: `${body}.${sign(body)}`, jti, expiresAt: new Date(exp * 1000) }
}

/** Returns the payload when the signature and expiry are both good, otherwise null. */
export const readGateToken = (token: string | undefined | null): GatePayload | null => {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  const expected = sign(body)
  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as GatePayload
    if (!payload?.email || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
