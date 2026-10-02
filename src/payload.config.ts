import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { AccessRequests } from './collections/AccessRequests'
import { Categories } from './collections/Categories'
import { LoginChallenges } from './collections/LoginChallenges'
import { Media } from './collections/Media'
import { Openings } from './collections/Openings'
import { Pages } from './collections/Pages'
import { People } from './collections/People'
import { RateLimits } from './collections/RateLimits'
import { Posts } from './collections/Posts'
import { SecurityEvents } from './collections/SecurityEvents'
import { SiteSettings } from './collections/SiteSettings'
import { Tenants } from './collections/Tenants'
import { Users } from './collections/Users'
import { Ventures } from './collections/Ventures'
import { VisitorCounts } from './collections/VisitorCounts'
import { plugins } from './plugins'
import { isStaff } from './access/roles'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Extra origins allowed to call the API with cookies (e.g. additional brand domains)
const allowedOrigins = [
  getServerSideURL(),
  ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? []),
].filter(Boolean)

export default buildConfig({
  admin: {
    components: {
      beforeLogin: ['@/components/admin/BeforeLogin'],
      beforeDashboard: ['@/components/admin/Welcome'],
      afterNavLinks: ['@/components/admin/GuideNavLink'],
      views: {
        guide: {
          Component: '@/components/admin/GuideView#GuideView',
          path: '/guide',
          meta: { title: 'How to use this panel' },
        },
      },
      graphics: {
        Logo: '@/components/admin/Graphics#Logo',
        Icon: '@/components/admin/Graphics#Icon',
      },
    },
    meta: {
      titleSuffix: ' — PJK Admin',
      icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/favicon.svg' }],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  editor: defaultLexical,
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  // Sidebar order follows this list
  collections: [
    Pages,
    Posts,
    Categories,
    Media,
    SiteSettings,
    Ventures,
    People,
    Openings,
    VisitorCounts,
    Tenants,
    Users,
    AccessRequests,
    SecurityEvents,
    LoginChallenges,
    RateLimits,
  ],
  cors: allowedOrigins,
  csrf: allowedOrigins,
  email: process.env.RESEND_API_KEY
    ? resendAdapter({
        apiKey: process.env.RESEND_API_KEY,
        defaultFromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@pjk.co.in',
        defaultFromName: process.env.EMAIL_FROM_NAME || 'PAT and J.K. Co.',
      })
    : undefined,
  plugins,
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Staff may run the queue by hand from the admin panel
        if (isStaff(req.user)) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
})
