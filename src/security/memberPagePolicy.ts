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

export const memberPagePolicy = (nonce: string, { dev = false } = {}): string =>
  [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ["script-src 'self'", `'nonce-${nonce}'`, "'strict-dynamic'", dev && "'unsafe-eval'"].filter(Boolean).join(' '),
    // Next.js and next/font set inline styles; styles cannot run code
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Pictures go from the browser straight to Vercel Blob in production
    `connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
