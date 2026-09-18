import { NextResponse, type NextRequest } from 'next/server'

import { GATE_COOKIE, GATE_PATH } from './security/constants'
import { readGateToken } from './security/gateToken'
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
    if (gate) return NextResponse.next()

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
