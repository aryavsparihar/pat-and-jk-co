import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { runKycPurge } from '@/kyc/service'
import { logSecurityEvent } from '@/security/events'
import { runHousekeeping } from '@/security/housekeeping'
import { isCronRequest } from '@/security/secrets'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; compared in constant time */
const authorised = (request: Request): boolean => isCronRequest(request.headers)

/**
 * The weekly KYC purge (vercel.json): applies the retention rules in docs/KYC.md and logs what it
 * removed, then deletes old sign-in codes and sessions (src/security/housekeeping.ts). Each run is
 * in the security log, and each KYC deletion with its reason. Only the cron can call it.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ message: 'Not allowed.' }, { status: 401 })
  const payload = await getPayload({ config: configPromise })
  const summary = await runKycPurge(payload)
  payload.logger.info({ msg: 'KYC purge', ...summary })
  const cleared = await runHousekeeping(payload)
  // So anyone can see in the admin that the weekly purge is running
  await logSecurityEvent(payload, {
    event: 'scheduled-task-ran',
    detail: `KYC purge: ${summary.members} member(s), ${summary.documents} upload(s) deleted${summary.failed ? `, ${summary.failed} failed and will be tried again` : ''}. Old sign-in codes: ${cleared.challenges}, old sessions: ${cleared.sessions} deleted`,
  })
  return Response.json(summary, {
    status: summary.failed ? 500 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
