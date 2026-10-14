/**
 * Removes personal data from anything about to be logged.
 *
 * Applied to every log line by the logger itself (`./logger.ts`), so it does not depend on each
 * caller remembering. It works on content, not just field names: an email address inside an error
 * message is caught as surely as one in an `email` field.
 *
 * What it removes:
 *   email addresses                         → [email]
 *   PAN (ABCDE1234F)                         → [pan]
 *   IFSC (ABCD0123456)                       → [ifsc]
 *   international phone numbers (+91 …)      → [phone]
 *   runs of 9 to 18 digits, with or without spaces or hyphens: Aadhaar numbers, bank account
 *   numbers, Indian mobile numbers          → [number]
 *   credentials: the user and password in a connection string (postgres://u:p@host),
 *   Bearer tokens, JWTs, and Resend, Vercel Blob and Vercel OIDC tokens  → [credentials] etc.
 *   any value under a key that names one of the above, or a password, token, key or secret
 *
 * It errs towards removing too much: a log line that loses a long number is a small cost, and
 * one that keeps an account number is not. Dates (2026-10-02 15:00) are left alone.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PAN = /\b[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]\b/gi
const IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi
const INTERNATIONAL_PHONE = /\+\d{1,3}[\s().-]*\d(?:[\s().-]*\d){6,13}/g
// 9–18 digits, optionally grouped by single spaces or hyphens, not part of a longer word or decimal
const LONG_NUMBER = /(?<![\w.])\d(?:[ -]?\d){8,17}(?![\w.])/g
const LOOKS_LIKE_DATE = /^\d{4}-\d{2}-\d{2}/
// postgres://user:password@host, and any other URL carrying a user and password
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
const SERVICE_KEY =
  /\b(?:re_[A-Za-z0-9_]{16,}|vercel_blob_rw_[A-Za-z0-9_]{16,}|npm_[A-Za-z0-9]{20,})\b/g

const SENSITIVE_KEY =
  /^(e-?mail|email_?address|phone|mobile|pan|pan_?number|aadhaar.*|account_?number|account_?no|acc_?no|ifsc.*|password|passcode|otp|token|secret|authorization|cookie|set-cookie|api_?key|.*_secret|.*_token|connection_?string|database_?url)$/i

export const redactString = (value: string): string =>
  value
    // Credentials first, before the email pattern can mistake user:pass@host for an address
    .replace(URL_CREDENTIALS, '$1[credentials]@')
    .replace(BEARER, 'Bearer [token]')
    .replace(JWT, '[jwt]')
    .replace(SERVICE_KEY, '[key]')
    .replace(EMAIL, '[email]')
    .replace(INTERNATIONAL_PHONE, '[phone]')
    .replace(PAN, '[pan]')
    .replace(IFSC, '[ifsc]')
    .replace(LONG_NUMBER, (match) => (LOOKS_LIKE_DATE.test(match) ? match : '[number]'))

const MAX_DEPTH = 8

const redactError = (error: Error, seen: WeakSet<object>, depth: number): Error => {
  // Same prototype, so the logger still reports a TypeError as a TypeError
  const copy = Object.create(Object.getPrototypeOf(error)) as Error
  Object.defineProperty(copy, 'message', {
    value: redactString(error.message),
    enumerable: false,
    writable: true,
  })
  copy.name = error.name
  Object.defineProperty(copy, 'stack', {
    value: error.stack ? redactString(error.stack) : undefined,
    enumerable: false,
    writable: true,
  })
  // Payload's errors carry `data` and `status`; keep them, redacted
  for (const [key, value] of Object.entries(error)) {
    ;(copy as unknown as Record<string, unknown>)[key] = redactAt(key, value, seen, depth + 1)
  }
  if ('cause' in error && error.cause !== undefined) {
    copy.cause = redactAt('cause', error.cause, seen, depth + 1)
  }
  return copy
}

const redactAt = (
  key: string | null,
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown => {
  if (
    key !== null &&
    SENSITIVE_KEY.test(key) &&
    value !== null &&
    value !== undefined &&
    value !== ''
  ) {
    return '[redacted]'
  }
  if (typeof value === 'string') return redactString(value)
  if (typeof value === 'number') {
    return Number.isInteger(value) && Math.abs(value) >= 1e8 && Math.abs(value) < 1e18
      ? '[number]'
      : value
  }
  if (typeof value === 'bigint') return '[number]'
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  if (depth > MAX_DEPTH) return '[nested]'
  seen.add(value)

  if (value instanceof Error) return redactError(value, seen, depth)
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map((item) => redactAt(null, item, seen, depth + 1))
  if (value instanceof Headers) return '[headers]'

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = redactAt(k, v, seen, depth + 1)
  return out
}

/** Redacts strings, numbers, objects, arrays and errors, at any depth. Never mutates its input. */
export const redact = <T>(value: T): T => redactAt(null, value, new WeakSet(), 0) as T
