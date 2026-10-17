import { MEMBER_COOKIE } from '@/security/constants'
import { type SessionKind, sessionHintHeader } from '@/utilities/sessionHint'

export const dynamic = 'force-dynamic'

/** Payload's staff session cookie (no cookiePrefix is set, so Payload's default) */
const STAFF_COOKIE = 'payload-token'

/**
 * Who is signed in, for the header on every page: "member", "staff" or no one, and nothing more.
 * Public pages are cached and identical for everyone, so this is the only place a visitor's
 * signed-in state is ever shown, and it is never cached by anyone.
 *
 * A request with neither session cookie is answered at once, without starting Payload or touching
 * the database. Otherwise Payload's own strategies decide, staff first (src/security/
 * strategyOrder.ts), checking the session is live, the account active and the member in good
 * standing, and extending a member's sliding session as any other use of it does. The answer also
 * sets or clears the hint cookie that tells pages whether to ask (src/utilities/sessionHint.ts).
 */
export async function GET(request: Request) {
  const cookies = request.headers.get('cookie') ?? ''
  const hasSessionCookie = cookies
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .some((name) => name === MEMBER_COOKIE || name === STAFF_COOKIE)

  let as: SessionKind | null = null
  const headers = new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    Vary: 'Cookie',
  })

  if (hasSessionCookie) {
    const [{ getPayload }, { default: config }] = await Promise.all([
      import('payload'),
      import('@payload-config'),
    ])
    const payload = await getPayload({ config })
    const { user, responseHeaders } = await payload.auth({
      headers: request.headers,
      canSetHeaders: true,
    })
    const signedIn = user as { collection?: string; status?: string; standing?: string } | null
    if (signedIn?.collection === 'users' && signedIn.status === 'active') as = 'staff'
    else if (signedIn?.collection === 'members' && signedIn.standing === 'active') as = 'member'
    responseHeaders?.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') headers.append('Set-Cookie', value)
    })
  }

  headers.append('Set-Cookie', sessionHintHeader(as))
  return Response.json({ as }, { headers })
}
