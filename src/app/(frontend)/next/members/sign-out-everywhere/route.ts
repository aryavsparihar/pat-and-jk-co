import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { memberIdsOf } from '@/collections/Members'
import { fromOurOrigin, refuseCrossSite, reply } from '@/members/http'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import {
  clearedCookieHeader,
  readMemberCookie,
  readSession,
  revokeAllSessions,
} from '@/security/memberSession'

export const dynamic = 'force-dynamic'

/** Ends every session the member has, on every device, this one included. */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const payload = await getPayload({ config: configPromise })

  const active = await readSession(payload, readMemberCookie(request.headers))
  if (!active) return reply({ message: 'You are not signed in.' }, { status: 401 })

  const ended = await revokeAllSessions(payload, active.member.id, 'signed out everywhere')
  await logSecurityEvent(payload, {
    event: 'member-signed-out-everywhere',
    email: active.member.email,
    ip: clientIp(request.headers),
    subject: memberIdsOf(active.member),
    detail: `${ended} session${ended === 1 ? '' : 's'} ended`,
  })

  return reply({ ok: true, ended }, { headers: { 'Set-Cookie': clearedCookieHeader() } })
}
