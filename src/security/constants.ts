/**
 * Admin access rules, in one place.
 *
 * Getting into the admin panel takes three things:
 *   1. a company mailbox  — a one-time code is emailed to an @pjk.co.in address (the "gate")
 *   2. an approved account — the address must belong to an active user
 *   3. a password         — Payload's own sign-in, behind the gate
 */

/** Only addresses at this domain may hold an account or receive a code. */
export const COMPANY_EMAIL_DOMAIN = (process.env.ADMIN_EMAIL_DOMAIN || 'pjk.co.in').toLowerCase()

/** Cookie holding proof that a one-time code was entered. */
export const GATE_COOKIE = 'pjk_admin_gate'

/** How long that proof lasts before a new code is needed. */
export const GATE_TTL_SECONDS = 60 * 60 * 12

/** Where people are sent to get a code. */
export const GATE_PATH = '/admin-access'

export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 10
export const OTP_MAX_ATTEMPTS = 5

/** Flood protection for code requests. */
export const OTP_MAX_PER_EMAIL_PER_HOUR = 5
export const OTP_MAX_PER_IP_PER_HOUR = 20
export const ACCESS_REQUESTS_PER_IP_PER_DAY = 3

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normaliseEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : ''

/** True only for a well-formed address at the company domain. */
export const isCompanyEmail = (email: unknown): boolean => {
  const value = normaliseEmail(email)
  return EMAIL_SHAPE.test(value) && value.endsWith(`@${COMPANY_EMAIL_DOMAIN}`)
}

/** Best-effort client address, used for rate limiting and the audit log. */
export const clientIp = (headers: Headers): string =>
  headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  headers.get('x-real-ip')?.trim() ||
  'unknown'
