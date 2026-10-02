import { sql } from '@payloadcms/db-postgres'
import { createHmac } from 'node:crypto'
import type { Payload } from 'payload'

import { execute } from '@/utilities/sql'

/**
 * Fixed-window rate limits held in Postgres, so they hold across every serverless instance.
 *
 * Each check is one statement: insert the counter, or bump it, or start a new window if the old
 * one has run out, and return the new count. Two requests at the same moment cannot both read
 * "4 of 5" and both get through.
 *
 * What is being limited (an IP, an email address) is never stored: the key is an HMAC of it
 * under PAYLOAD_SECRET, prefixed with the scope in the clear so the table can still be read.
 */

export type Limit = {
  /** What is being protected, e.g. "form-submit" or "otp-email". Stored in the clear. */
  scope: string
  /** Who is being counted: an IP, an email, a member id. Stored only as a keyed hash. */
  subject: string
  /** Most requests allowed per window */
  max: number
  windowSeconds: number
}

export type LimitResult = {
  allowed: boolean
  count: number
  /** Seconds until the window resets */
  retryAfter: number
}

/** Longest window any caller may use. Rows older than twice this are swept away. */
const MAX_WINDOW_SECONDS = 24 * 60 * 60

export const rateLimitKey = (scope: string, subject: string): string => {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET is not set; rate limits cannot be keyed')
  const digest = createHmac('sha256', secret)
    .update(`${scope}\u0000${subject.trim().toLowerCase()}`)
    .digest('base64url')
  return `${scope}:${digest}`
}

/** Counts one request and says whether it is within the limit. */
export const hitLimit = async (payload: Payload, limit: Limit): Promise<LimitResult> => {
  const windowSeconds = Math.min(Math.max(1, Math.floor(limit.windowSeconds)), MAX_WINDOW_SECONDS)
  const key = rateLimitKey(limit.scope, limit.subject)
  const expired = sql`rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})`

  // In ON CONFLICT … DO UPDATE, every expression on the right reads the row as it was before
  // this statement, so both CASEs see the same old window.
  const [row] = await execute<{ hits: number | string; elapsed: number | string }>(
    payload,
    sql`
      INSERT INTO rate_limits (key, window_start, hits)
      VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN ${expired} THEN 1 ELSE rate_limits.hits + 1 END,
        window_start = CASE WHEN ${expired} THEN now() ELSE rate_limits.window_start END
      RETURNING hits, EXTRACT(EPOCH FROM (now() - window_start)) AS elapsed
    `,
  )

  // Now and then, clear out counters nobody has touched for a while
  if (Math.random() < 0.02) {
    void execute(
      payload,
      sql`DELETE FROM rate_limits WHERE window_start < now() - make_interval(secs => ${MAX_WINDOW_SECONDS * 2})`,
    ).catch(() => undefined)
  }

  const count = Number(row?.hits ?? 1)
  const elapsed = Number(row?.elapsed ?? 0)
  return {
    allowed: count <= limit.max,
    count,
    retryAfter: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  }
}

/** Checks several limits for one request; refuses if any of them is exceeded. */
export const hitLimits = async (payload: Payload, limits: Limit[]): Promise<LimitResult> => {
  const results = await Promise.all(limits.map((limit) => hitLimit(payload, limit)))
  const refused = results.filter((r) => !r.allowed)
  if (refused.length === 0) return { allowed: true, count: 0, retryAfter: 0 }
  return {
    allowed: false,
    count: Math.max(...refused.map((r) => r.count)),
    retryAfter: Math.max(...refused.map((r) => r.retryAfter)),
  }
}
