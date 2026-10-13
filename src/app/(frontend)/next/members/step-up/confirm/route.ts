import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { confirmSession } from '@/members/recent'
import { checkChallenge } from '@/security/challenges'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'

export const dynamic = 'force-dynamic'

/**
 * The fresh code from /next/members/step-up, entered: the session counts as just signed in, for
 * the next 30 minutes of sensitive actions (src/members/recent.ts).
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member, session } = auth
  const ip = clientIp(request.headers)

  const body = await readJson<{ challengeId: unknown; code: unknown }>(request)
  const step = await checkChallenge(payload, {
    challengeId: body?.challengeId,
    code: body?.code,
    audience: 'member',
  })
  if (!step.ok || step.purpose !== 'step-up' || step.email !== member.email) {
    await logSecurityEvent(payload, {
      event: 'member-code-failed',
      email: member.email,
      ip,
      detail: 'step-up',
    })
    return reply(
      { message: 'That code is not right, or it has expired. Ask for a new one.' },
      { status: 401 },
    )
  }

  await confirmSession(payload, session)
  await logSecurityEvent(payload, { event: 'member-confirmed', email: member.email, ip })
  return withRefresh(reply({ ok: true }), auth.refresh)
}
