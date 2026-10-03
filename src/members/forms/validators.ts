/**
 * Small, exact checks for the values Indian forms ask for. Each returns true or false and never
 * throws, so the same function serves the browser's gentle inline hints and the server's verdict.
 */

/** Six digits, the first never 0 (no Indian PIN starts with 0) */
export const isPin = (value: string): boolean => /^[1-9][0-9]{5}$/.test(value.trim())

/**
 * An international phone number in E.164: +, a country code, then the number, 8 to 15 digits in
 * all. Indian mobiles (+91) must be ten digits starting 6–9.
 */
export const toE164 = (value: string, defaultCountry = '91'): string | null => {
  const raw = value.trim()
  if (!raw) return null
  let digits = raw.replace(/[\s().-]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  if (!digits.startsWith('+')) {
    // A bare ten-digit number is taken as Indian; a leading 0 trunk prefix is dropped
    const local = digits.replace(/^0/, '')
    if (!/^\d{10}$/.test(local)) return null
    digits = `+${defaultCountry}${local}`
  }
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null
  if (digits.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(digits)) return null
  return digits
}

export const isE164 = (value: string): boolean => toE164(value) === value

/**
 * GSTIN: 2-digit state code, the 10-character PAN, an entity number, the letter Z, and a check
 * character computed from the other fourteen. The check digit is verified, so a typo is caught.
 */
export const isGstin = (value: string): boolean => {
  const gstin = value.trim().toUpperCase()
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false
  const state = Number(gstin.slice(0, 2))
  if (state < 1 || state > 38) return false
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const product = chars.indexOf(gstin[i]!) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return chars[(36 - (sum % 36)) % 36] === gstin[14]
}

/** An https:// (or http://) web address with a real-looking host */
export const isWebUrl = (value: string): boolean => {
  try {
    const url = new URL(value.trim())
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && /\.[a-z]{2,}$/i.test(url.hostname)
    )
  } catch {
    return false
  }
}

/** Turns "@handle", "handle" or an instagram.com link into the profile's https URL */
export const instagramUrl = (value: string): string | null => {
  const raw = value.trim()
  if (!raw) return null
  const fromUrl = raw.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?$/i)
  const handle = fromUrl?.[1] ?? raw.replace(/^@/, '')
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}` : null
}

/**
 * Today's date as it is in India, in the UTC fields of a Date. Ages are counted by the Indian
 * calendar day, so someone turning 18 can apply from midnight in India, not 5½ hours later.
 */
export const todayInIndia = (now = new Date()): Date => new Date(now.getTime() + 330 * 60_000)

/** Whole years between a date of birth and today (in India) */
export const ageOn = (dateOfBirth: string, today = todayInIndia()): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth.trim())
  if (!match) return null
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  const born = new Date(Date.UTC(y, m - 1, d))
  if (born.getUTCMonth() !== m - 1 || born.getUTCDate() !== d) return null
  let age = today.getUTCFullYear() - y
  const beforeBirthday =
    today.getUTCMonth() < m - 1 || (today.getUTCMonth() === m - 1 && today.getUTCDate() < d)
  if (beforeBirthday) age -= 1
  return age
}
