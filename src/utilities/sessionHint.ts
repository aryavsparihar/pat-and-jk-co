/**
 * Whether it is worth asking who is signed in. Every public page is served from the cache, the
 * same to everyone, so the header learns who is signed in from the browser, by asking
 * /next/session. Most visitors are not signed in, and asking costs a server call on every page,
 * so a hint cookie says whether to ask at all:
 *
 *   pjk_signed_in=member|staff   set when someone signs in, and by /next/session whenever it
 *                                finds a session; cleared at sign-out, and by /next/session
 *                                whenever it finds none
 *
 * It holds no secret and grants nothing: it only decides whether the browser asks. The session
 * cookies themselves stay HttpOnly, and /next/session is always the one that answers. A forged or
 * stale hint costs one request, after which it is corrected.
 */

export const SESSION_HINT_COOKIE = 'pjk_signed_in'

export type SessionKind = 'member' | 'staff'

const secure = () => process.env.NODE_ENV === 'production'

/** A Set-Cookie header for the hint, or one that removes it */
export const sessionHintHeader = (kind: SessionKind | null, maxAgeSeconds = 30 * 86_400) =>
  [
    `${SESSION_HINT_COOKIE}=${kind ?? ''}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${kind ? maxAgeSeconds : 0}`,
    secure() && 'Secure',
  ]
    .filter(Boolean)
    .join('; ')

/** The hint as the browser sees it, or null */
export const readSessionHint = (cookieHeader: string | null | undefined): SessionKind | null => {
  const value = (cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_HINT_COOKIE}=`))
    ?.slice(SESSION_HINT_COOKIE.length + 1)
  return value === 'member' || value === 'staff' ? value : null
}

/** The channel and key every tab watches, to be told to ask again who is signed in */
export const SESSION_CHANNEL = 'pjk-session'
export const SESSION_PING_KEY = 'pjk-session-ping'

/**
 * The hint, written by the browser. Server replies set it with Set-Cookie (sessionHintHeader
 * above); the admin panel signs in and out through Payload's own endpoints, so it has no reply of
 * its own to ride on and writes the hint here. Secure follows the page's own protocol, since the
 * admin runs on http://localhost in development.
 */
export const writeSessionHint = (kind: SessionKind | null, maxAgeSeconds = 30 * 86_400) => {
  const flag = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${SESSION_HINT_COOKIE}=${kind ?? ''}; Path=/; SameSite=Lax; Max-Age=${
    kind ? maxAgeSeconds : 0
  }${flag}`
}

/** Tells every other open tab of the site to ask again who is signed in */
export const pingSessionTabs = () => {
  try {
    new BroadcastChannel(SESSION_CHANNEL).postMessage('changed')
    window.localStorage.setItem(SESSION_PING_KEY, String(Date.now()))
  } catch {
    // An old browser or storage turned off: the site's tabs ask again when next shown
  }
}
