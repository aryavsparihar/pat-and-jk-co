import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * A signed note of when a form was shown, sent back with the submission. People take a few
 * seconds at least to fill anything in; a script posting the instant the page loads does not.
 * Signed, so the time cannot be made up, and dated, so an old one cannot be reused forever.
 */

const MIN_SECONDS = 2
const MAX_SECONDS = 60 * 60 * 24

const sign = (value: string) => {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is not set')
  return createHmac('sha256', `form-token:${secret}`).update(value).digest('base64url')
}

export const createFormToken = (now = Date.now()): string => {
  const issued = String(Math.floor(now / 1000))
  return `${issued}.${sign(issued)}`
}

export type FormTokenCheck = 'ok' | 'missing' | 'forged' | 'too-fast' | 'expired'

export const checkFormToken = (token: unknown, now = Date.now()): FormTokenCheck => {
  if (typeof token !== 'string' || !token.includes('.')) return 'missing'
  const [issued, signature] = token.split('.')
  if (!issued || !signature || !/^\d{9,11}$/.test(issued)) return 'forged'
  const expected = Buffer.from(sign(issued))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'forged'
  const age = now / 1000 - Number(issued)
  if (age < MIN_SECONDS) return 'too-fast'
  if (age > MAX_SECONDS) return 'expired'
  return 'ok'
}
