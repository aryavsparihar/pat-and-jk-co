import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV === 'development'

/**
 * Content Security Policy, in two strengths.
 *
 * The public site runs no third-party script and never evaluates strings as code, so it gets
 * neither 'unsafe-eval' nor any outside script host, and may only talk to its own origin. The
 * admin panel needs more: 'unsafe-eval' for parts of its UI, jsDelivr for the code editor
 * (Monaco) to fetch itself, and outbound HTTPS for client uploads straight to Vercel Blob.
 *
 * 'unsafe-inline' stays on script-src for both. Next.js inlines its bootstrap scripts, and the
 * alternative, a nonce, has to differ on every response, which would mean rendering every page
 * per request instead of serving it from the CDN. See docs/AUDIT.md, section 8.
 */
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
    ]
      .filter(Boolean)
      .join(' '),
    "worker-src 'self' blob:",
    admin ? "connect-src 'self' https:" : `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "frame-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ')

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
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Where several rules set the same header, the later one wins: the admin panel gets its
      // looser policy, and uploads get the sandbox instead of either
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
