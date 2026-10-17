import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { execute } from '@/utilities/sql'

/**
 * Personal data the site needs only for a while, deleted when that while is over (docs/SECURITY.md,
 * "Retention"). Run weekly by the same cron as the KYC purge (/next/cron/kyc-purge).
 *
 *   sign-in codes     an address, an IP and a hashed code; a code lasts ten minutes, and the
 *                     record is kept 30 days for looking into anything odd
 *   member sessions   a device description; kept 90 days after the session ended or ran out, so a
 *                     member's list of devices and any investigation still have them
 *
 * The security log is the record of what happened and is not trimmed here.
 */
export const RETENTION_DAYS = { challenges: 30, sessions: 90 } as const

export const runHousekeeping = async (payload: Payload) => {
  const challenges = await execute<{ id: number }>(
    payload,
    sql`DELETE FROM login_challenges
        WHERE expires_at < now() - make_interval(days => ${RETENTION_DAYS.challenges})
        RETURNING id`,
  )
  const sessions = await execute<{ id: number }>(
    payload,
    sql`DELETE FROM member_sessions
        WHERE coalesce(revoked_at, least(expires_at, absolute_expires_at))
              < now() - make_interval(days => ${RETENTION_DAYS.sessions})
        RETURNING id`,
  )
  return { challenges: challenges.length, sessions: sessions.length }
}
