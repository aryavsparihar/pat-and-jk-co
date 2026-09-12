import { NextResponse, type NextRequest } from 'next/server'

import { normalizeHost, TENANT_SITES_PREFIX } from './utilities/host'

/**
 * Routes each request to the right brand.
 *
 *   https://pjk.co.in/about  →  /tenant-sites/pjk.co.in/about  (internally)
 *
 * The brand is looked up from the hostname inside the [host] route, so this stays a pure
 * string rewrite — no database call on every request, and pages remain statically cached.
 * The admin panel, API, preview routes and static files are not rewritten.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Already an internal brand path (used by admin previews) — serve as-is
  if (pathname.startsWith(`${TENANT_SITES_PREFIX}/`)) return NextResponse.next()

  const host = normalizeHost(request.headers.get('host'))
  const url = request.nextUrl.clone()
  url.pathname = `${TENANT_SITES_PREFIX}/${host}${pathname === '/' ? '' : pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    '/((?!admin|api/|next/|_next/|_vercel/|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|css|js|map|webmanifest|pdf|mp4|webm)$).*)',
  ],
}
