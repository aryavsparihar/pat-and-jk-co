/**
 * Whether a string is shaped like an email address: something@domain.tld, with no spaces. Not a
 * full check of the standard (nothing short of sending mail is), only a sanity check before we do.
 *
 * Kept linear on purpose, as it runs on text anyone can send. The domain is matched one label at a
 * time, labels never containing a dot, so there is only ever one way to split it; and anything
 * longer than the 254 characters an address may have is refused before any pattern runs. The
 * pattern used before, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, could try every place to split a long
 * string, so a crafted one sent to a public form could hold a server function for seconds
 * (CodeQL js/polynomial-redos).
 *
 * Used on the server and in the browser alike.
 */

/** The most an address can be (RFC 5321) */
export const MAX_EMAIL_LENGTH = 254

const SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
/** As SHAPE, but the last label (the top-level domain) has at least two characters */
const SHAPE_WITH_TLD = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/

export const isEmailShaped = (value: string, { tld = false }: { tld?: boolean } = {}): boolean =>
  value.length <= MAX_EMAIL_LENGTH && (tld ? SHAPE_WITH_TLD : SHAPE).test(value)
