import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV === 'development'

/**
 * The site's one public address. Vercel also serves production at pat-and-jk-co.vercel.app (open
 * to anyone) and at each deployment's own address (behind Vercel's login). A production build
 * sends every *.vercel.app request on to pjk.co.in with a permanent redirect (308), keeping the
 * path and query, so people and search engines settle on one address. Previews are built without
 * it and stay behind Vercel's login.
 *
 * Vercel's cron jobs call the production deployment at its own address, with the cron secret in
 * the Authorization header, which a redirect to another host would drop; they are recognised by
 * the user agent Vercel gives them and left alone.
 */
const SITE_HOST = 'pjk.co.in'
const VERCEL_HOST = '.+\\.vercel\\.app'
const isProductionBuild = process.env.VERCEL_ENV === 'production'

/**
 * Content Security Policy, in two strengths.
 *
 * The public site never evaluates strings as code and runs one outside script, Cloudflare
 * Turnstile on its forms (src/security/turnstile.ts), which needs its script and its frame from
 * challenges.cloudflare.com; it may otherwise only talk to its own origin. The
 * admin panel needs more: 'unsafe-eval' for parts of its UI, jsDelivr for the code editor
 * (Monaco) to fetch itself, and outbound HTTPS for client uploads straight to Vercel Blob.
 *
 * 'unsafe-inline' stays on script-src for both. Next.js inlines its bootstrap scripts, and the
 * alternative, a nonce, has to differ on every response, which would mean rendering every page
 * per request instead of serving it from the CDN. See docs/AUDIT.md, section 8.
 */
const TURNSTILE = 'https://challenges.cloudflare.com'

const contentSecurityPolicy = ({ admin }: { admin: boolean }) =>
  [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    // Media may be served from Vercel Blob, and the admin previews uploads as blob: URLs
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    [
      "script-src 'self' 'unsafe-inline'",
      // Development needs eval for fast refresh
      (admin || isDev) && "'unsafe-eval'",
      admin && 'https://cdn.jsdelivr.net',
      !admin && TURNSTILE,
    ]
      .filter(Boolean)
      .join(' '),
    "worker-src 'self' blob:",
    admin ? "connect-src 'self' https:" : `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    admin ? "frame-src 'self'" : `frame-src 'self' ${TURNSTILE}`,
    // Not in development: Safari (WebKit) applies it to http://localhost, and would ask for the
    // page's own files over https, which a developer's machine does not serve
    !isDev && 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Same-origin framing is allowed so the admin panel's live preview keeps working
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // No other site's window can keep a handle on ours (and vice versa)
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const siteHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy({ admin: false }) },
]

const adminHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy({ admin: true }) },
]

/**
 * Uploaded files are served from our own origin, and an SVG is a document that can run script.
 * Sandboxing the media route means an uploaded file cannot script the site even if one ever gets
 * past the editors who upload them.
 */
const uploadHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox",
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
]

const nextConfig: NextConfig = {
  // Hide the floating Next.js dev-tools button (it only ever appears in `pnpm dev`)
  devIndicators: false,
  // Don't generate assistant instruction files in the repo
  agentRules: false,
  // pdf.js reads masked e-Aadhaar PDFs on the server (src/kyc/aadhaarCheck.ts). Left unbundled, it
  // finds its worker beside itself in node_modules; the worker is loaded by a computed path, so it
  // is added to the KYC route's traced files by hand, or a deployment would not include it. The
  // path is the real file in pnpm's store: node_modules/pdfjs-dist itself is a symlink, which
  // Vercel cannot package ("invalid deployment package ... symlinked directories")
  serverExternalPackages: ['pdfjs-dist'],
  outputFileTracingIncludes: {
    '/next/members/kyc': [
      './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
  },
  // Temporarily required on Windows until Next.js fixes Turbopack Sass resolution.
  // See: https://github.com/vercel/next.js/issues/86431
  sassOptions: {
    loadPaths: ['./node_modules/@payloadcms/ui/dist/scss/'],
  },
  images: {
    // Media is served by Payload at /api/media/file/… (locally and from Vercel Blob)
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    qualities: [90],
    formats: ['image/avif', 'image/webp'],
  },
  async redirects() {
    if (!isProductionBuild) return []
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: VERCEL_HOST }],
        missing: [{ type: 'header', key: 'user-agent', value: 'vercel-cron/.*' }],
        destination: `https://${SITE_HOST}/:path*`,
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The site-wide policy, everywhere except the member pages, which get a stricter per-request
      // policy with a nonce from src/proxy.ts (src/security/memberPagePolicy.ts)
      {
        source: '/:path((?!account(?:/|$)|collaborate/(?:artists|partners|signin)(?:/|$)).*)',
        headers: siteHeaders,
      },
      // Where several rules set the same header, the later one wins: the admin panel gets its
      // looser policy, and uploads get the sandbox instead of either
      // The identity photo is taken in the artist application, and the map there can use the
      // device's location, so the camera and location are allowed there and nowhere else. The
      // same value as CAMERA_PERMISSIONS in src/security/memberPagePolicy.ts, which the proxy sets
      {
        source: '/collaborate/artists',
        headers: [
          {
            key: 'Permissions-Policy',
            value:
              'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()',
          },
        ],
      },
      { source: '/admin', headers: adminHeaders },
      { source: '/admin/:path*', headers: adminHeaders },
      { source: '/api/media/file/:path*', headers: uploadHeaders },
      { source: '/media/:path*', headers: uploadHeaders },
    ]
  },
  poweredByHeader: false,
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
