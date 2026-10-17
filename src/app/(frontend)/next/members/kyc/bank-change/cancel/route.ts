import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { notifyStaffOfBankChange } from '@/members/emails'
import { fromOurOrigin, readJson, refuseCrossSite, reply } from '@/members/http'
import { cancelBankChangeByToken } from '@/kyc/service'
import { clearedCookieHeader, revokeAllSessions } from '@/security/memberSession'
import { hitLimit } from '@/security/rateLimit'
import { clientIp } from '@/security/constants'
import { sessionHintHeader } from '@/utilities/sessionHint'

export const dynamic = 'force-dynamic'

/**
 * "This was not me": stops a pending change of bank details and signs everyone out of the
 * account, from the link in the notification email. A POST from the confirmation page, so a mail
 * scanner following the link cannot trigger it by accident.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const payload = await getPayload({ config: configPromise })
  const limit = await hitLimit(payload, {
    scope: 'bank-cancel',
    subject: clientIp(request.headers),
    max: 20,
    windowSeconds: 3600,
  })
  if (!limit.allowed) return reply({ message: 'Please wait a little.' }, { status: 429 })

  const body = await readJson<{ token: string }>(request)
  const memberId = await cancelBankChangeByToken(payload, String(body?.token ?? ''))
  if (!memberId) {
    return reply(
      { message: 'This link has already been used, or the change has already been dealt with.' },
      { status: 404 },
    )
  }
  await revokeAllSessions(payload, memberId, 'bank change reported as not theirs')
  const record = (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: memberId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  await notifyStaffOfBankChange(payload, { reference: record?.reference, cancelled: true })
  return reply(
    { ok: true },
    {
      headers: [
        ['Set-Cookie', clearedCookieHeader()],
        ['Set-Cookie', sessionHintHeader(null)],
      ],
    },
  )
}
