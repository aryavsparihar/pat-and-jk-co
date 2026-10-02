import { ensureApplication } from '@/members/accounts'
import { fromOurOrigin, readJson, refuseCrossSite, reply, requireMember, withRefresh } from '@/members/http'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'

export const dynamic = 'force-dynamic'

/**
 * Starts an application of the other kind for someone already signed in: an approved partner who
 * now applies as an artist does not need another code, and keeps their one account.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const body = await readJson<{ type: string }>(request)
  if (body?.type !== 'artist' && body?.type !== 'partner') {
    return reply({ message: 'Choose the artist or the partner application.' }, { status: 400 })
  }

  const ensured = await ensureApplication(payload, { email: member.email, type: body.type })
  if (ensured.createdApplication) {
    await logSecurityEvent(payload, {
      event: 'member-created',
      email: member.email,
      ip: clientIp(request.headers),
      subject: ensured.application.reference,
      detail: `apply-${body.type}, existing member`,
    })
  }
  return withRefresh(reply({ ok: true, reference: ensured.application.reference }), auth.refresh)
}
