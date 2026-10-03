import { postgresAdapter } from '@payloadcms/db-postgres'
import { pgSequence } from '@payloadcms/db-postgres/drizzle/pg-core'
import { resendAdapter } from '@payloadcms/email-resend'
import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { AccessRequests } from './collections/AccessRequests'
import { Applications } from './collections/Applications'
import { Categories } from './collections/Categories'
import { KycDocuments } from './collections/KycDocuments'
import { KycRecords } from './collections/KycRecords'
import { LoginChallenges } from './collections/LoginChallenges'
import { Members } from './collections/Members'
import { MemberSessions } from './collections/MemberSessions'
import { Media } from './collections/Media'
import { Openings } from './collections/Openings'
import { Pages } from './collections/Pages'
import { People } from './collections/People'
import { Artworks } from './collections/Artworks'
import { PortfolioImages } from './collections/PortfolioImages'
import { RateLimits } from './collections/RateLimits'
import { Posts } from './collections/Posts'
import { SecurityEvents } from './collections/SecurityEvents'
import { SiteSettings } from './collections/SiteSettings'
import { Tenants } from './collections/Tenants'
import { Users } from './collections/Users'
import { Ventures } from './collections/Ventures'
import { VisitorCounts } from './collections/VisitorCounts'
import { loadEnv } from './env'
import { MEMBER_ID_SEQUENCE } from './members/ids'
import { createLogger } from './observability/logger'
import { plugins } from './plugins'
import { guardMemberAccess } from './access/memberGuard'
import { isStaff } from './access/roles'
import { defaultLexical } from '@/fields/defaultLexical'
import { putStaffSessionFirst } from './security/strategyOrder'
import { trustedOrigins } from './utilities/getURL'

// Fails fast, naming every missing or malformed variable (src/env.ts)
const env = loadEnv()

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Origins allowed to call the API with cookies: the site's URL and ALLOWED_ORIGINS, or on a
// Preview deployment its own URLs (src/utilities/getURL.ts)
const allowedOrigins = trustedOrigins()

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
      connectionString: env.DATABASE_URL,
    },
    // Member IDs come from these two sequences (src/members/ids.ts). Payload does not model
    // sequences, so they ride along in the enums slot of the Drizzle schema: that is enough for
    // migrations to create them and for development push to keep them rather than drop them.
    afterSchemaInit: [
      ({ schema }) => ({
        ...schema,
        enums: {
          ...schema.enums,
          member_id_artist_seq: pgSequence(MEMBER_ID_SEQUENCE.artist, { startWith: 1 }),
          member_id_partner_seq: pgSequence(MEMBER_ID_SEQUENCE.partner, { startWith: 1 }),
        } as unknown as typeof schema.enums,
      }),
    ],
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
    // Staff before members: Payload tries each auth collection's strategies in this order, so a
    // staff session always wins over a member cookie on the same request
    Users,
    Members,
    Applications,
    PortfolioImages,
    Artworks,
    KycRecords,
    KycDocuments,
    AccessRequests,
    SecurityEvents,
    LoginChallenges,
    RateLimits,
    MemberSessions,
  ],
  cors: allowedOrigins,
  csrf: allowedOrigins,
  // Nothing uses GraphQL: the site reads through the Local API and the admin panel through REST.
  // Off, it is one less way in to every collection. (Its route files are deleted for the same reason.)
  graphQL: { disable: true },
  // The deepest the site ever asks for is 2. A public REST read with ?depth=10 would otherwise
  // fan out across every relationship, which is an easy way to make the database work hard.
  maxDepth: 4,
  // Server-side uploads (anything not sent straight to Blob from the browser)
  upload: { limits: { fileSize: 20_000_000 } },
  email: process.env.RESEND_API_KEY
    ? resendAdapter({
        apiKey: process.env.RESEND_API_KEY,
        defaultFromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@pjk.co.in',
        defaultFromName: process.env.EMAIL_FROM_NAME || 'PAT and J.K. Co.',
      })
    : undefined,
  // JSON lines in production, with personal data redacted from every line (src/observability)
  logger: createLogger(),
  // Staff session before member session when a request carries both (src/security/strategyOrder.ts)
  onInit: async (payload) => putStaffSessionFirst(payload),
  plugins,
  secret: env.PAYLOAD_SECRET,
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
}).then(
  // After Payload has added its own collections, so the guard covers those too: a signed-in
  // member never gets more than a visitor anywhere (src/access/memberGuard.ts)
  guardMemberAccess,
)
