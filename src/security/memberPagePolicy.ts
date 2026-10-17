/**
 * The content security policy for pages where people type personal details: the onboarding, the
 * member sign-in and the account. These pages are rendered per request anyway, so each response
 * can carry its own nonce, and scripts run only if they carry it ('strict-dynamic' lets those
 * scripts load the rest of the app). No 'unsafe-inline' for scripts, and the pages cannot be framed.
 *
 * Applied by src/proxy.ts; next.config.ts leaves these paths out of the site-wide policy so the
 * two never combine.
 */

/** The pages that get this policy */
export const MEMBER_PAGE = /^\/(?:collaborate\/(?:artists|partners|signin)|account)(?:\/|$)/

export const createNonce = (): string => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Google Maps, for the optional map on the artist application's address step, where a key is set
 * (NEXT_PUBLIC_GOOGLE_MAPS_KEY). Its script is loaded by the app's own nonce'd code, which
 * 'strict-dynamic' trusts, so no script host is listed; these are what that script then fetches,
 * as Google's own guidance lists them (developers.google.com/maps/documentation/javascript/
 * content-security-policy). Added on the artist application only, never on the other pages.
 */
/**
 * OpenStreetMap's map, where Google's is not set up or could not load: its own tiles, Esri's
 * satellite imagery and place names, OpenTopoMap's terrain, and one search for the typed town on
 * OpenStreetMap's Nominatim (src/components/onboarding/artist/LocationPin.tsx).
 */
const OPEN_MAPS = {
  img: 'https://tile.openstreetmap.org https://server.arcgisonline.com https://*.tile.opentopomap.org',
  connect: 'https://nominatim.openstreetmap.org',
}

const GOOGLE_MAPS = {
  img: 'https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com',
  connect: 'https://*.googleapis.com https://*.google.com https://*.gstatic.com',
  font: 'https://fonts.gstatic.com',
  style: 'https://fonts.googleapis.com',
  frame: 'https://*.google.com',
}

export const memberPagePolicy = (nonce: string, { dev = false, maps = false } = {}): string =>
  [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // Cloudflare Turnstile's loader is added by the app's own script, which 'strict-dynamic'
    // trusts; the host is listed for browsers that predate 'strict-dynamic'
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      'https://challenges.cloudflare.com',
      dev && "'unsafe-eval'",
    ]
      .filter(Boolean)
      .join(' '),
    // Next.js and next/font set inline styles; styles cannot run code
    `style-src 'self' 'unsafe-inline'${maps ? ` ${GOOGLE_MAPS.style}` : ''}`,
    // The optional map pin's tiles on the address step (OPEN_MAPS above, and Google's where set up)
    `img-src 'self' data: blob: ${OPEN_MAPS.img}${maps ? ` ${GOOGLE_MAPS.img}` : ''}`,
    `font-src 'self'${maps ? ` ${GOOGLE_MAPS.font}` : ''}`,
    // Pictures go from the browser straight to Vercel Blob in production
    `connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com ${OPEN_MAPS.connect}${maps ? ` ${GOOGLE_MAPS.connect}` : ''}${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    // Turnstile's challenge, and on the artist application Google's map
    `frame-src https://challenges.cloudflare.com${maps ? ` ${GOOGLE_MAPS.frame}` : ''}`,
    // Not on a developer's machine: Safari (WebKit) applies it to http://localhost too, and the
    // page's own styles and scripts would then be asked for over https, which is not there
    !dev && 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ')

/**
 * The artist application may use the camera (the identity photo is taken in the page) and, when the
 * artist presses "Use my location" on the map, the device's location; the browser asks them first
 * either way. Every other page keeps the site-wide Permissions-Policy, which turns both off
 * (next.config.ts).
 */
export const CAMERA_PAGE = /^\/collaborate\/artists\/?$/

export const CAMERA_PERMISSIONS =
  'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()'
