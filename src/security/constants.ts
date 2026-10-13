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

/** The gate also ends after this long without admin activity */
export const GATE_IDLE_SECONDS = 30 * 60

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

/* ─── Members (artists and partners) ───────────────────────────────────────────────────────── */

/**
 * Members sign in with a one-time code alone: there are no member passwords. The code rules
 * (length, life, attempts) are the same as the staff gate's, from the same implementation.
 */

/** The member session cookie. httpOnly, SameSite=Lax, Secure in production. */
export const MEMBER_COOKIE = 'pjk_member'

/** A session lasts a day from the last time it was used… */
export const MEMBER_SESSION_IDLE_SECONDS = 60 * 60 * 24
/** …and never more than thirty days from sign-in, however often it is used */
export const MEMBER_SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24 * 30
/**
 * How stale "last used" may get before it is written again (saves a write per request). Well
 * under the idle limit, so a session in use never runs out between writes
 */
export const MEMBER_SESSION_TOUCH_SECONDS = 60 * 10

/** Flood protection for member codes, counted in Postgres (src/security/rateLimit.ts) */
export const MEMBER_CODES_PER_EMAIL_PER_HOUR = 5
export const MEMBER_CODES_PER_IP_PER_HOUR = 20
export const MEMBER_VERIFY_PER_IP_PER_HOUR = 30
/** Wrong codes for one address in an hour before that address is locked for the hour */
export const MEMBER_FAILURES_BEFORE_LOCK = 10

const ANY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A plausible email address of any domain, at most 254 characters */
export const isEmail = (email: unknown): boolean => {
  const value = normaliseEmail(email)
  return value.length <= 254 && ANY_EMAIL.test(value)
}
