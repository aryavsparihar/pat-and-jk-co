import { NextResponse, type NextRequest } from 'next/server'

import { GATE_COOKIE, GATE_PATH } from './security/constants'
import { readGateToken, touchGateToken } from './security/gateToken'
import {
  CAMERA_PAGE,
  CAMERA_PERMISSIONS,
  createNonce,
  MEMBER_PAGE,
  memberPagePolicy,
} from './security/memberPagePolicy'
import { normalizeHost, TENANT_SITES_PREFIX } from './utilities/host'

/**
 * Runs before every page request, and does two jobs.
 *
 * 1. Guards the admin panel. /admin and the authentication APIs are only reachable with a
 *    valid gate cookie, which is issued after a one-time code has been emailed to a company
 *    mailbox and entered (see /admin-access). Without it the panel and its sign-in API do
 *    not answer at all, so passwords cannot be guessed and the panel cannot be found by
 *    anyone outside the company.
 *
 * 2. Routes each request to the right brand:
 *      https://pjk.co.in/about  →  /tenant-sites/pjk.co.in/about  (internally)
 *    The brand is resolved inside the [host] route, so this stays a pure string rewrite —
 *    no database call per request, and pages stay statically cached.
 */

/** Paths that require the gate: the admin panel and everything that can authenticate. */
const isGuarded = (pathname: string) =>
  pathname === '/admin' ||
  pathname.startsWith('/admin/') ||
  pathname.startsWith('/api/users') ||
  pathname.startsWith('/api/graphql')

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (isGuarded(pathname)) {
    const gate = readGateToken(request.cookies.get(GATE_COOKIE)?.value)
    if (gate) {
      const response = NextResponse.next()
      // Admin activity keeps the gate open for another 30 minutes, renewed at most once a minute
      const nowSeconds = Math.floor(Date.now() / 1000)
      if (nowSeconds - (gate.seen ?? 0) > 60) {
        response.cookies.set(GATE_COOKIE, touchGateToken(gate), {
          httpOnly: true,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: Math.max(0, gate.exp - nowSeconds),
        })
      }
      return response
    }

    // API callers get a plain refusal; people get sent to the gate
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { errors: [{ message: 'Admin access requires a one-time code. Visit /admin-access.' }] },
        { status: 401 },
      )
    }

    const url = request.nextUrl.clone()
    url.pathname = GATE_PATH
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  // Already an internal brand path (used by admin previews) — serve as-is
  if (pathname.startsWith(`${TENANT_SITES_PREFIX}/`)) return NextResponse.next()

  // The gate itself and Payload's API are not brand pages
  if (pathname === GATE_PATH || pathname.startsWith('/api/')) return NextResponse.next()

  const host = normalizeHost(request.headers.get('host'))
  const url = request.nextUrl.clone()
  url.pathname = `${TENANT_SITES_PREFIX}/${host}${pathname === '/' ? '' : pathname}`

  // `normalizeHost` already refuses anything but a hostname. Checking the result as well means
  // a rewrite can never leave the brand routes even if that guarantee is one day weakened —
  // the URL setter resolves "/.." segments, so a single bad character would otherwise be enough
  // to reach the admin panel past the gate above.
  if (!url.pathname.startsWith(`${TENANT_SITES_PREFIX}/`)) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Pages where people type personal details get a per-request nonce and a strict policy
  if (MEMBER_PAGE.test(pathname)) {
    const nonce = createNonce()
    const policy = memberPagePolicy(nonce, { dev: process.env.NODE_ENV === 'development' })
    // Next.js reads the nonce from this request header and puts it on its own scripts
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('content-security-policy', policy)
    requestHeaders.set('x-nonce', nonce)
    const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    response.headers.set('Content-Security-Policy', policy)
    if (CAMERA_PAGE.test(pathname)) response.headers.set('Permissions-Policy', CAMERA_PERMISSIONS)
    return response
  }

  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    // Guarded areas
    '/admin',
    '/admin/:path*',
    '/api/users/:path*',
    '/api/graphql',
    '/api/graphql-playground',
    // Brand pages: everything except the API, preview routes, framework paths and files.
    // (Uploads to /api/media must not pass through here, so /api/ stays excluded.)
    '/((?!admin|api/|next/|_next/|_vercel/|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|css|js|map|webmanifest|pdf|mp4|webm)$).*)',
  ],
}
