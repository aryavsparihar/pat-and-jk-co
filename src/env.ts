import { z } from 'zod'

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
  z
    .string()
    .trim()
    .min(min, `is too short: at least ${min} characters (${GENERATE})`)
    .optional()

/** Empty strings in .env files mean "not set" */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional())

const origin = z
  .url({ error: 'must be a full URL such as https://pjk.co.in' })
  .refine((v) => !v.endsWith('/'), 'must not end with a slash')

const email = z.email({ error: 'must be an email address' })

const schema = z.object({
  // Required everywhere
  DATABASE_URL: z
    .string({ error: 'is not set (a postgres:// connection string)' })
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  PAYLOAD_SECRET: secret(16),

  // Optional, with safe fallbacks in the code
  NEXT_PUBLIC_SERVER_URL: optional(origin),
  PREVIEW_SECRET: optional(optionalSecret(16)),
  CRON_SECRET: optional(optionalSecret(16)),
  DEFAULT_TENANT_SLUG: optional(z.string().regex(/^[a-z0-9-]+$/, 'must be a brand slug, e.g. pjk')),
  ALLOWED_ORIGINS: optional(
    z
      .string()
      .refine(
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

  // Email
  RESEND_API_KEY: optional(z.string().startsWith('re_', 'must be a Resend key (starts with re_)')),
  EMAIL_FROM_ADDRESS: optional(email),
  EMAIL_FROM_NAME: optional(z.string()),
  CONTACT_INBOX: optional(email),
  BUSINESS_INBOX: optional(email),
  TECHNICAL_INBOX: optional(email),

  // Media
  BLOB_READ_WRITE_TOKEN: optional(
    z.string().startsWith('vercel_blob_rw_', 'must be a Vercel Blob read-write token'),
  ),

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
  {
    key: 'BLOB_READ_WRITE_TOKEN',
    why: 'without it, uploads are written to a serverless disk that is thrown away',
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
  for (const warning of warnings) console.warn(`[env] ${warning}`)
  checked = env
  return env
}
