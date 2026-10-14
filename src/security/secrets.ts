import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Whether a value given by a caller matches a secret from the environment, compared in constant
 * time (by digest, so the lengths cannot be told apart either). An unset or empty secret matches
 * nothing, so a missing variable can never turn a check into "anyone".
 */
export const matchesSecret = (given: string | null | undefined, secret: string | undefined) => {
  if (!secret) return false
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(given ?? ''), digest(secret))
}

/** `Authorization: Bearer <CRON_SECRET>`, as Vercel Cron sends it */
export const isCronRequest = (headers: Headers) =>
  matchesSecret(
    headers.get('authorization'),
    process.env.CRON_SECRET && `Bearer ${process.env.CRON_SECRET}`,
  )
