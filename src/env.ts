import { z } from 'zod'

import { TURNSTILE_TEST_SECRET, TURNSTILE_TEST_SITE_KEY } from './security/turnstile'

/**
 * Every environment variable the app reads, checked once at boot.
 *
 * Loaded by `payload.config.ts`, so it runs whenever Payload starts: the dev server, `next build`,
 * `payload migrate` on deploy, scripts and tests. A missing or malformed value stops it with a
 * message naming each problem, instead of surfacing later as a confusing failure (a gate that
 * cannot sign tokens, a database URL that is an empty string).
 *
 * Strict where a mistake is dangerous or silent; lenient where the code already has a safe
 * fallback, so an optional value can never take the live site down. Values are never printed.
 *
 * Adding a variable: add it here, to `.env.example`, and to docs/SETUP.md.
 */

const GENERATE = 'generate one with: openssl rand -hex 32'

const secret = (min: number) =>
  z
    .string({ error: `is not set (${GENERATE})` })
    .trim()
    .min(min, `is too short: at least ${min} characters (${GENERATE})`)

const optionalSecret = (min: number) =>
  z.string().trim().min(min, `is too short: at least ${min} characters (${GENERATE})`).optional()

/** Empty strings in .env files mean "not set" */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional())

const origin = z
  .url({ error: 'must be a full URL such as https://pjk.co.in' })
  .refine((v) => !v.endsWith('/'), 'must not end with a slash')

const email = z.email({ error: 'must be an email address' })

/** A 32-byte key, base64-encoded, for the KYC encryption (src/kyc/crypto.ts) */
const kycKey = z
  .string()
  .trim()
  .refine(
    (v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32,
    'must be 32 bytes, base64-encoded (generate one with: openssl rand -base64 32)',
  )

const schema = z.object({
  // Required everywhere
  DATABASE_URL: z
    .string({ error: 'is not set (a postgres:// connection string)' })
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  PAYLOAD_SECRET: secret(16),
  // The database owner, for migrations at build time only; the site itself uses DATABASE_URL, the
  // least-privileged app role (docs/SETUP.md, "Database roles")
  DATABASE_URL_MIGRATE: optional(
    z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  ),

  // Optional, with safe fallbacks in the code
  NEXT_PUBLIC_SERVER_URL: optional(origin),
  PREVIEW_SECRET: optional(optionalSecret(16)),
  CRON_SECRET: optional(optionalSecret(16)),
  DEFAULT_TENANT_SLUG: optional(z.string().regex(/^[a-z0-9-]+$/, 'must be a brand slug, e.g. pjk')),
  ALLOWED_ORIGINS: optional(
    z.string().refine(
      (v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
          .every((o) => origin.safeParse(o).success),
      'must be a comma-separated list of origins such as https://phulhaar.com',
    ),
  ),
  ADMIN_EMAIL_DOMAIN: optional(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'must be a domain')),

  // Members: signs the member session cookie. Separate from PAYLOAD_SECRET so member sessions
  // can be revoked all at once, by rotating it, without signing staff out
  MEMBER_SESSION_SECRET: optional(optionalSecret(32)),

  // Email
  RESEND_API_KEY: optional(z.string().startsWith('re_', 'must be a Resend key (starts with re_)')),
  EMAIL_FROM_ADDRESS: optional(email),
  EMAIL_FROM_NAME: optional(z.string()),
  CONTACT_INBOX: optional(email),
  BUSINESS_INBOX: optional(email),
  TECHNICAL_INBOX: optional(email),

  // Cloudflare Turnstile on the code request and the public forms (src/security/turnstile.ts).
  // Both or neither: without them, as on a developer's machine, the check is skipped
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional(z.string().min(10, 'must be a Turnstile site key')),
  TURNSTILE_SECRET_KEY: optional(z.string().min(10, 'must be a Turnstile secret key')),

  // Google Maps on the artist application's address step (src/components/onboarding/artist/
  // LocationPin.tsx). Public by design: Google restricts it to our sites and the APIs we use
  // (docs/SETUP.md). Without it the map is OpenStreetMap's, as before
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: optional(
    z.string().regex(/^AIza[\w-]{35}$/, 'must be a Google API key'),
  ),
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: optional(z.string().min(4, 'must be a Google Maps map ID')),

  // Media
  BLOB_READ_WRITE_TOKEN: optional(
    z.string().startsWith('vercel_blob_rw_', 'must be a Vercel Blob read-write token'),
  ),

  // KYC (docs/KYC.md). Two different keys, both kept offline as well: losing the encryption key
  // loses every KYC record. The previous key is set only while rotating (pnpm kyc:rotate-key)
  KYC_ENCRYPTION_KEY: optional(kycKey),
  KYC_ENCRYPTION_KEY_PREVIOUS: optional(kycKey),
  KYC_BLIND_INDEX_KEY: optional(kycKey),
  // The private Blob store for identity documents (pjk-kyc), reached with the deployment's OIDC
  // token: no read-write token exists for it, by design (src/kyc/documentStore.ts)
  KYC_STORE_ID: optional(
    z
      .string()
      .trim()
      .regex(/^store_[A-Za-z0-9]+$/, 'must be a Blob store ID (store_…)'),
  ),
  // Set by Vercel with the public media store; read only to make sure KYC never uses it
  BLOB_STORE_ID: optional(z.string().trim()),

  // Logging (src/observability/logger.ts)
  LOG_LEVEL: optional(z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])),
  DISABLE_LOGGING: optional(z.enum(['true', 'false'])),

  // Build and development switches
  MIGRATE_ON_PREVIEW: optional(z.enum(['0', '1'])),
  DEV_APPLICATIONS_OPEN: optional(z.enum(['0', '1'])),

  // Set by Vercel
  VERCEL_ENV: optional(z.enum(['production', 'preview', 'development'])),
})

export type Env = z.infer<typeof schema>

/** What production cannot run without, beyond what every environment needs. */
const productionRequirements: { key: keyof Env; why: string }[] = [
  {
    key: 'NEXT_PUBLIC_SERVER_URL',
    why: 'canonical URLs, CORS and CSRF need it (https://pjk.co.in)',
  },
  { key: 'RESEND_API_KEY', why: 'without email, nobody can receive a sign-in code' },
  { key: 'CRON_SECRET', why: 'the weekly KYC purge and the job queue are refused without it' },
  { key: 'PREVIEW_SECRET', why: 'live preview in the admin needs it' },
  {
    key: 'MEMBER_SESSION_SECRET',
    why: 'member sessions are signed with it',
  },
  {
    key: 'BLOB_READ_WRITE_TOKEN',
    why: 'without it, uploads are written to a serverless disk that is thrown away',
  },
  {
    key: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    why: 'the forms show the Cloudflare Turnstile check with it',
  },
  { key: 'TURNSTILE_SECRET_KEY', why: 'the server checks Turnstile tokens with it' },
  { key: 'KYC_ENCRYPTION_KEY', why: 'identity and bank details are encrypted with it' },
  { key: 'KYC_BLIND_INDEX_KEY', why: 'duplicate PANs and accounts are found with it' },
  {
    key: 'KYC_STORE_ID',
    why: 'identity documents are kept in the private Blob store pjk-kyc, never the public one',
  },
]

export type EnvResult = { env: Env; problems: string[]; warnings: string[] }

/** Pure, so it can be tested without touching process.env. */
export const parseEnv = (source: Record<string, string | undefined>): EnvResult => {
  const problems: string[] = []
  const warnings: string[] = []

  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`${issue.path.join('.') || '(environment)'} ${issue.message}`)
    }
  }
  const env = (parsed.success ? parsed.data : {}) as Env

  if (parsed.success && env.VERCEL_ENV === 'production') {
    for (const { key, why } of productionRequirements) {
      if (!env[key]) problems.push(`${key} is required in production: ${why}`)
    }
    if (env.NEXT_PUBLIC_SERVER_URL && !env.NEXT_PUBLIC_SERVER_URL.startsWith('https://')) {
      problems.push('NEXT_PUBLIC_SERVER_URL must use https:// in production')
    }
    // Cloudflare's test keys pass everyone: right for a preview, an open door in production
    if (TURNSTILE_TEST_SECRET.test(env.TURNSTILE_SECRET_KEY?.trim() ?? '')) {
      problems.push(
        "TURNSTILE_SECRET_KEY is one of Cloudflare's test keys; production needs the real one",
      )
    }
    if (TURNSTILE_TEST_SITE_KEY.test(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? '')) {
      problems.push(
        "NEXT_PUBLIC_TURNSTILE_SITE_KEY is one of Cloudflare's test keys; production needs the real one",
      )
    }
  }

  if (parsed.success) {
    const same = (a?: string, b?: string) => Boolean(a && b && a.trim() === b.trim())
    if (same(env.KYC_ENCRYPTION_KEY, env.KYC_BLIND_INDEX_KEY)) {
      problems.push('KYC_BLIND_INDEX_KEY must be a different key from KYC_ENCRYPTION_KEY')
    }
    if (same(env.KYC_ENCRYPTION_KEY, env.KYC_ENCRYPTION_KEY_PREVIOUS)) {
      problems.push('KYC_ENCRYPTION_KEY_PREVIOUS must be the old key, not the current one')
    }
    if (env.KYC_ENCRYPTION_KEY_PREVIOUS && !env.KYC_ENCRYPTION_KEY) {
      problems.push('KYC_ENCRYPTION_KEY_PREVIOUS is set without KYC_ENCRYPTION_KEY')
    }
    const storeId = (v?: string) =>
      v
        ?.trim()
        .replace(/^store_/i, '')
        .toLowerCase()
    if (env.KYC_STORE_ID && storeId(env.KYC_STORE_ID) === storeId(env.BLOB_STORE_ID)) {
      problems.push('KYC_STORE_ID must be the private KYC store, not the public media store')
    }
  }

  if (parsed.success && env.PAYLOAD_SECRET.length < 32) {
    warnings.push(
      `PAYLOAD_SECRET is ${env.PAYLOAD_SECRET.length} characters; 32 or more is recommended (${GENERATE}). Changing it signs everyone out, nothing else.`,
    )
  }

  return { env, problems, warnings }
}

export class EnvError extends Error {
  constructor(problems: string[]) {
    super(
      [
        'The environment is not set up correctly:',
        ...problems.map((p) => `  - ${p}`),
        'Set these in .env locally, or in Vercel → Settings → Environment Variables. See docs/SETUP.md.',
      ].join('\n'),
    )
    this.name = 'EnvError'
  }
}

let checked: Env | null = null

/** Validates process.env once and returns it typed. Throws EnvError listing every problem. */
export const loadEnv = (): Env => {
  if (checked) return checked
  const { env, problems, warnings } = parseEnv(process.env)
  if (problems.length > 0) throw new EnvError(problems)
  // Once per process at runtime; not from each of the build's many workers
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    for (const warning of warnings) console.warn(`[env] ${warning}`)
  }
  checked = env
  return env
}
