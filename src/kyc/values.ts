/**
 * Rules for KYC values: what a PAN, an IFSC and an account number look like, how they are shown
 * masked, and whether two names plausibly belong to the same person. No secrets here, so the
 * browser can use the same rules for its hints as the server uses for its verdict.
 */

/** Five letters, four digits, a letter */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/** Four letters (the bank), a zero, six letters or digits (the branch) */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

/** Indian bank account numbers are 9 to 18 digits */
export const ACCOUNT_PATTERN = /^\d{9,18}$/

export const normalisePan = (value: string) => value.replace(/\s+/g, '').toUpperCase()
export const normaliseIfsc = (value: string) => value.replace(/\s+/g, '').toUpperCase()
export const normaliseAccount = (value: string) => value.replace(/[\s-]/g, '')

export type PanProblem = 'format' | 'not-individual'

/** The fourth character says who holds the PAN; P is an individual */
export const panProblem = (value: string): PanProblem | null => {
  const pan = normalisePan(value)
  if (!PAN_PATTERN.test(pan)) return 'format'
  if (pan[3] !== 'P') return 'not-individual'
  return null
}

export const isIfsc = (value: string) => IFSC_PATTERN.test(normaliseIfsc(value))
export const isAccountNumber = (value: string) => ACCOUNT_PATTERN.test(normaliseAccount(value))

/** Exactly four digits: the only part of an Aadhaar number this site ever accepts */
export const isAadhaarLast4 = (value: string) => /^\d{4}$/.test(value.trim())

/** True for anything that looks like a full Aadhaar number (12 digits), so it can be refused */
export const looksLikeFullAadhaar = (value: string) => /^\d{12}$/.test(value.replace(/[\s-]/g, ''))

/* ─── Masks: what anyone, member or staff, sees by default ──────────────── */

/** ABCPE1234F → ABCxxxxx4F */
export const maskPan = (value: string) => {
  const pan = normalisePan(value)
  return `${pan.slice(0, 3)}${'x'.repeat(Math.max(0, pan.length - 5))}${pan.slice(-2)}`
}

/** 123456784821 → XXXXXXXX4821 */
export const maskAccount = (value: string) => {
  const account = normaliseAccount(value)
  return `${'X'.repeat(Math.max(0, account.length - 4))}${account.slice(-4)}`
}

/** 1234 → XXXX XXXX 1234 */
export const maskAadhaar = (last4: string) => `XXXX XXXX ${last4.trim()}`

/** SBIN0001234 → SBIN0xxxxxx: the bank is not secret, the branch is */
export const maskIfsc = (value: string) => {
  const ifsc = normaliseIfsc(value)
  return `${ifsc.slice(0, 5)}${'x'.repeat(Math.max(0, ifsc.length - 5))}`
}

/* ─── Names ─────────────────────────────────────────────────────────────── */

const TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'SHRI', 'SMT', 'KUMARI', 'SRI', 'PROF'])

const nameTokens = (name: string) =>
  name
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t))

/**
 * Whether an account holder's name plausibly matches the applicant's: true if they share a word of
 * three letters or more. Banks abbreviate and reorder names ("A K SHARMA", "SHARMA ASHA"), so this
 * only catches clear mismatches, and it warns rather than refuses.
 */
export const namesPlausiblyMatch = (a: string, b: string): boolean => {
  const left = new Set(nameTokens(a).filter((t) => t.length >= 3))
  return nameTokens(b).some((t) => t.length >= 3 && left.has(t))
}
