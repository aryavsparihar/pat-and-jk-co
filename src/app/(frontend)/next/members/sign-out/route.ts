import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { fromOurOrigin, refuseCrossSite, reply } from '@/members/http'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import {
  clearedCookieHeader,
  readMemberCookie,
  readSession,
  revokeSession,
} from '@/security/memberSession'

export const dynamic = 'force-dynamic'

/** Ends this browser's session. The cookie is cleared whether or not the session was still valid. */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const payload = await getPayload({ config: configPromise })

  const active = await readSession(payload, readMemberCookie(request.headers))
  if (active) {
    await revokeSession(payload, active.session.sid, 'signed out')
    await logSecurityEvent(payload, {
      event: 'member-signed-out',
      email: active.member.email,
      ip: clientIp(request.headers),
      subject: active.member.memberId ?? undefined,
    })
  }

  return reply({ ok: true }, { headers: { 'Set-Cookie': clearedCookieHeader() } })
}
