import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

/**
 * Content Security Policy.
 *
 * Next.js and the Payload admin both inline scripts, so `script-src` still needs 'unsafe-inline'
 * (and 'unsafe-eval' for the admin) until every inline script carries a nonce. The rest of the
 * policy is what earns its keep: no plugins, no framing by other sites, no injected <base> tag,
 * and forms that can only post back to us.
 */
const contentSecurityPolicy = [
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
  // jsDelivr is where the admin panel's code editor (Monaco) fetches itself from; the public
  // site loads no third-party script at all. Drop it if the admin never shows a code field.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' https:",
  "frame-src 'self'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Same-origin framing is allowed so the admin panel's live preview keeps working
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
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
      // More specific rules win, so uploads get the sandbox instead of the site policy
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
