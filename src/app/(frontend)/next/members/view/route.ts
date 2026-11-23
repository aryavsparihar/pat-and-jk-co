import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { VIEW_COOKIE, holds, isAccountView } from '@/members/accountView'
import { readMemberCookie, readSession } from '@/security/memberSession'

export const dynamic = 'force-dynamic'

/**
 * GET /next/members/view?to=artist|partner: switches a member who holds both IDs to the other
 * account, then shows it. Only the account they hold can be chosen; anyone else simply lands on
 * their account page. The cookie is a display preference and grants nothing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const to = url.searchParams.get('to')
  const headers = new Headers({ Location: '/account', 'Cache-Control': 'no-store' })
  const payload = await getPayload({ config: configPromise })
  const active = await readSession(payload, readMemberCookie(request.headers))
  if (!active) headers.set('Location', '/collaborate/signin')
  else if (isAccountView(to) && holds(active.member, to)) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    headers.append(
      'Set-Cookie',
      `${VIEW_COOKIE}=${to}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`,
    )
  }
  if (active?.refreshCookie) headers.append('Set-Cookie', active.refreshCookie)
  return new Response(null, { status: 303, headers })
}
