import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

import { OTP_LENGTH } from './constants'

/** A numeric one-time code, generated with a cryptographic source. */
export const createOtp = (): string => {
  const max = 10 ** OTP_LENGTH
  return String(randomInt(0, max)).padStart(OTP_LENGTH, '0')
}

/**
 * Codes are never stored: only a keyed hash is, so a leaked database row cannot be
 * turned back into a working code.
 */
export const hashOtp = (code: string, salt: string): string =>
  createHmac('sha256', `${process.env.PAYLOAD_SECRET}:${salt}`).update(code.trim()).digest('hex')

export const otpMatches = (code: string, salt: string, storedHash: string): boolean => {
  const given = Buffer.from(hashOtp(code, salt))
  const stored = Buffer.from(storedHash)
  return given.length === stored.length && timingSafeEqual(given, stored)
}

/**
 * Passwords for the admin panel. Long and mixed, and checked on the server so the rule
 * cannot be skipped by calling the API directly.
 */
export const passwordProblem = (password: string, email?: string): string | null => {
  if (password.length < 12) return 'Use at least 12 characters.'
  if (password.length > 200) return 'That password is too long.'
  if (!/[a-z]/.test(password)) return 'Include a lowercase letter.'
  if (!/[A-Z]/.test(password)) return 'Include a capital letter.'
  if (!/[0-9]/.test(password)) return 'Include a number.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Include a symbol.'
  if (/^(.)\1+$/.test(password)) return 'Use something less repetitive.'
  const local = email?.split('@')[0]?.toLowerCase()
  if (local && local.length > 2 && password.toLowerCase().includes(local)) {
    return 'Do not include your email address in your password.'
  }
  if (/(password|qwerty|12345678|admin|letmein|pjk\.co\.in)/i.test(password)) {
    return 'That password contains a very common word or phrase.'
  }
  return null
}
