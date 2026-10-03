import { sendMemberCode } from '@/members/emails'
import { fromOurOrigin, refuseCrossSite, reply, requireMember, withRefresh } from '@/members/http'
import { issueChallenge } from '@/security/challenges'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * A fresh code to the signed-in member's own address, needed again before a sensitive change
 * (new bank details) even inside a valid session: a stolen session alone is not enough.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const limit = await hitLimit(payload, {
    scope: 'member-step-up',
    subject: String(member.id),
    max: 5,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply(
      { message: 'Too many codes have been asked for. Try again in an hour.' },
      { status: 429 },
    )

  const ip = clientIp(request.headers)
  const challenge = await issueChallenge(payload, {
    email: member.email,
    ip,
    audience: 'member',
    purpose: 'step-up',
    deliverable: true,
  })
  const sent = await sendMemberCode(payload, {
    email: member.email,
    code: challenge.code,
    purpose: 'step-up',
  })
  await logSecurityEvent(payload, {
    event: 'member-code-requested',
    email: member.email,
    ip,
    detail: 'step-up',
  })
  if (!sent)
    return reply(
      { message: 'We could not send the code just now. Please try again.' },
      { status: 503 },
    )
  return withRefresh(
    reply({ challengeId: challenge.id, message: 'A code is on its way to your email address.' }),
    auth.refresh,
  )
}
