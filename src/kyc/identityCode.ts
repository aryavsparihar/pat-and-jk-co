import 'server-only'

import { timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

import { newIdentityCode } from '@/members/ids'

import { blindIndex } from './crypto'

/**
 * The code an artist writes on paper, with their full name and date of birth, and holds up in a
 * photo of themselves: proof that a real person is applying, now. A code is good for ten minutes;
 * asking for a new one ends the old one at once. Only an HMAC of it is kept with the application
 * (identityCodeHash), with when it was given and until when it holds; the code itself travels to
 * the artist once, and is kept, encrypted, only with the photo taken with it.
 */

export const IDENTITY_CODE_MINUTES = 10

/** A photo that arrives this soon after its code ran out still counts: sending it takes time */
const GRACE_MS = 2 * 60_000

export type IssuedCode = { code: string; issuedAt: string; expiresAt: string }

export const issueIdentityCode = async (
  payload: Payload,
  applicationId: number,
  now = new Date(),
): Promise<IssuedCode> => {
  const code = newIdentityCode()
  const issuedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + IDENTITY_CODE_MINUTES * 60_000).toISOString()
  await payload.update({
    collection: 'applications',
    id: applicationId,
    data: {
      identityCodeHash: blindIndex('identity-code', code),
      identityCodeIssuedAt: issuedAt,
      identityCodeExpiresAt: expiresAt,
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  return { code, issuedAt, expiresAt }
}

export type CodeCheck = 'ok' | 'none' | 'wrong' | 'expired'

/** Whether `code` is the artist's current code, still in time */
export const checkIdentityCode = (
  application: { identityCodeHash?: string | null; identityCodeExpiresAt?: string | null },
  code: string,
  now = new Date(),
): CodeCheck => {
  if (!application.identityCodeHash || !application.identityCodeExpiresAt) return 'none'
  const given = Buffer.from(blindIndex('identity-code', code), 'hex')
  const held = Buffer.from(application.identityCodeHash, 'hex')
  if (given.length !== held.length || !timingSafeEqual(given, held)) return 'wrong'
  return new Date(application.identityCodeExpiresAt).getTime() + GRACE_MS < now.getTime()
    ? 'expired'
    : 'ok'
}

/** A date of birth as the day it is in India, however it was stored ("1990-04-12") */
const birthDay = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** Who the photo shows: the name written on the paper and the date of birth beside it */
export const identityFingerprint = (name: string, dateOfBirth: string | null | undefined) =>
  blindIndex('identity', `${name}|${birthDay(dateOfBirth)}`)

/** What the artist is told when a photo cannot be accepted */
export const CODE_PROBLEM: Record<Exclude<CodeCheck, 'ok'>, string> = {
  none: 'Please get your code first, then take the photo.',
  wrong:
    'This photo was taken with an earlier code. Please take it again, with the code shown now.',
  expired:
    'Your code ran out before the photo arrived. Please get a new code and take the photo again.',
}
