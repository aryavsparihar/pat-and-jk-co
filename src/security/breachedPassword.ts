import { createHash } from 'node:crypto'

/**
 * Whether a password appears in a known data breach, from Have I Been Pwned's free range API
 * (no account, no key). Only the first five characters of the password's SHA-1 hash leave the
 * server; the API returns every suffix that shares them, and the match is made here, so neither
 * the password nor its full hash is ever sent. Padding is asked for, so the size of the reply does
 * not hint at the prefix either.
 *
 * Returns true or false, or null when the service could not be reached in time: the caller
 * then lets the password through and logs that the check was skipped, so an outage at Have I Been
 * Pwned never stops anyone choosing a password.
 */

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const TIMEOUT_MS = 4000

export const sha1Hex = (value: string) =>
  createHash('sha1').update(value).digest('hex').toUpperCase()

export const isBreachedPassword = async (
  password: string,
  {
    fetchImpl = fetch,
    timeoutMs = TIMEOUT_MS,
  }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<boolean | null> => {
  const hash = sha1Hex(password)
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  try {
    const response = await fetchImpl(`${RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'pjk.co.in password check' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    const body = await response.text()
    for (const line of body.split('\n')) {
      const [candidate, count] = line.trim().split(':')
      // Padding entries have a count of 0 and are not real breaches
      if (candidate === suffix && Number(count) > 0) return true
    }
    return false
  } catch {
    return null
  }
}

export const BREACHED_MESSAGE =
  'This password has appeared in a known data breach, so it is not safe to use. Please choose a different one.'
