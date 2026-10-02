import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { reply } from '@/members/http'
import { readMemberCookie, readSession } from '@/security/memberSession'

export const dynamic = 'force-dynamic'

/**
 * Who is signed in, for pages that need to know. Only what the member may see about
 * themselves; never cached. Extends a sliding session like any other use of it.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const active = await readSession(payload, readMemberCookie(request.headers))
  if (!active) return reply({ signedIn: false })

  const { member } = active
  return reply(
    {
      signedIn: true,
      member: {
        memberId: member.memberId ?? null,
        type: member.type,
        standing: member.standing,
        displayName: member.displayName ?? null,
      },
    },
    { headers: active.refreshCookie ? { 'Set-Cookie': active.refreshCookie } : undefined },
  )
}
