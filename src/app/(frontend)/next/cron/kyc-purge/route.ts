import configPromise from '@payload-config'
import { createHash, timingSafeEqual } from 'node:crypto'
import { getPayload } from 'payload'

import { runKycPurge } from '@/kyc/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; compared in constant time */
const authorised = (request: Request): boolean => {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = request.headers.get('authorization') ?? ''
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`))
}

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
