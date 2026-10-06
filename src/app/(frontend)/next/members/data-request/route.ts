import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { notifyStaffOfDataRequest } from '@/members/emails'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

const KINDS = {
  'withdraw-consent': 'Withdraw consent to process identity and payout details',
  delete: 'Delete my account and my data',
  download: 'Send me a copy of my data',
} as const

/**
 * A member's request about their own data. Withdrawing consent takes effect at once: the KYC
 * record is marked, nothing further is processed, and `pnpm kyc:purge` deletes it unless the law
 * requires it to be kept. Deletion and copies are recorded for staff to carry out (docs/KYC.md).
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const limit = await hitLimit(payload, {
    scope: 'data-request',
    subject: String(member.id),
    max: 5,
    windowSeconds: 86_400,
  })
  if (!limit.allowed) return reply({ message: 'We already have your request.' }, { status: 429 })

  const body = await readJson<{ kind: string }>(request)
  const kind = body?.kind as keyof typeof KINDS
  if (!KINDS[kind]) return reply({ message: 'Which request?' }, { status: 400 })

  if (kind === 'withdraw-consent') {
    await payload.update({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      data: { consentWithdrawnAt: new Date().toISOString() },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    await logSecurityEvent(payload, {
      event: 'kyc-consent-withdrawn',
      email: member.email,
      ip: clientIp(request.headers),
    })
  }
  await logSecurityEvent(payload, {
    event: 'data-request',
    email: member.email,
    ip: clientIp(request.headers),
    detail: KINDS[kind],
  })
  const application = (
    await payload.find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  await notifyStaffOfDataRequest(payload, {
    reference: member.artistId || member.partnerId || application?.reference,
    request: KINDS[kind],
  })
  return withRefresh(
    reply({ ok: true, message: 'Thank you. We have your request and will write to you.' }),
    auth.refresh,
  )
}
