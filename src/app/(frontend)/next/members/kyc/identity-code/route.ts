import { IDENTITY_CODE_MINUTES, issueIdentityCode } from '@/kyc/identityCode'
import { EDITABLE, findOwnApplication } from '@/members/application'
import { fromOurOrigin, refuseCrossSite, reply, requireMember, withRefresh } from '@/members/http'
import { applicationsOpenness, closedReply } from '@/members/openness'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * A new identity code, good for ten minutes. Any earlier code stops working at once. The code
 * comes back in this reply only; the server keeps a hash of it (src/kyc/identityCode.ts).
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const { open, note } = await applicationsOpenness(payload)
  if (!open) return closedReply(note)

  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application || !EDITABLE.includes(application.stage)) {
    return reply(
      { message: 'A code can only be given while your application is open.' },
      { status: 409 },
    )
  }

  const limit = await hitLimit(payload, {
    scope: 'identity-code',
    subject: String(member.id),
    max: 30,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply(
      { message: 'Please wait a little before asking for another code.' },
      { status: 429 },
    )

  const issued = await issueIdentityCode(payload, application.id)
  return withRefresh(reply({ ...issued, minutes: IDENTITY_CODE_MINUTES }), auth.refresh)
}
