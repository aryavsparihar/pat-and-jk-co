import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { runKycPurge } from '@/kyc/service'
import { isCronRequest } from '@/security/secrets'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; compared in constant time */
const authorised = (request: Request): boolean => isCronRequest(request.headers)

/**
 * The weekly KYC purge (vercel.json): applies the retention rules in docs/KYC.md and logs what it
 * removed. Each deletion is also in the security log with its reason. Only the cron can call it.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ message: 'Not allowed.' }, { status: 401 })
  const payload = await getPayload({ config: configPromise })
  const summary = await runKycPurge(payload)
  payload.logger.info({ msg: 'KYC purge', ...summary })
  return Response.json(summary, {
    status: summary.failed ? 500 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
