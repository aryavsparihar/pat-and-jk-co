import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import { GATE_IDLE_SECONDS, GATE_TTL_SECONDS } from './constants'

/**
 * A small signed token proving that someone entered the one-time code sent to their
 * company mailbox. It is checked in `proxy.ts` before any admin page or auth API is reached,
 * so the check costs no database call. Signed with PAYLOAD_SECRET (HMAC-SHA256).
 *
 * It ends 12 hours after the code was entered, or after 30 minutes without admin activity,
 * whichever comes first: the proxy renews `seen` as the admin is used (touchGateToken), never
 * `exp`.
 */

type GatePayload = {
  /** address the code was sent to */
  email: string
  /** seconds since the epoch */
  exp: number
  /** unique id, so a token can be recognised in the audit log */
  jti: string
  /** seconds since the epoch: the last admin activity */
  seen?: number
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

const secret = () => {
  const value = process.env.PAYLOAD_SECRET
  if (!value) throw new Error('PAYLOAD_SECRET is not set — the admin gate cannot sign tokens')
  return value
}

const sign = (data: string) => createHmac('sha256', secret()).update(data).digest('base64url')

const now = () => Math.floor(Date.now() / 1000)

const issue = (payload: GatePayload) => {
  const body = encode(payload)
  return `${body}.${sign(body)}`
}

export const createGateToken = (email: string): { token: string; jti: string; expiresAt: Date } => {
  const jti = randomUUID()
  const exp = now() + GATE_TTL_SECONDS
  return { token: issue({ email, exp, jti, seen: now() }), jti, expiresAt: new Date(exp * 1000) }
}

/** The same token, marked as used now; its 12-hour end stays where it was */
export const touchGateToken = (payload: GatePayload): string => issue({ ...payload, seen: now() })

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
    // Tokens issued before `seen` existed count from when they were issued
    const seen = payload.seen ?? payload.exp - GATE_TTL_SECONDS
    if ((seen + GATE_IDLE_SECONDS) * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
