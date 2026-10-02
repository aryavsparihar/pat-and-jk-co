import { describe, expect, it } from 'vitest'

import { EnvError, parseEnv } from '@/env'

// Obviously fake values: none of these is a real secret or a real database
const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/example',
  PAYLOAD_SECRET: 'x'.repeat(64),
}

describe('environment validation', () => {
  it('accepts the minimum a local setup needs', () => {
    const { problems, warnings } = parseEnv(base)
    expect(problems).toEqual([])
    expect(warnings).toEqual([])
  })

  it('names every missing or malformed variable, and never prints a value', () => {
    const { problems } = parseEnv({
      DATABASE_URL: 'mysql://not-postgres',
      NEXT_PUBLIC_SERVER_URL: 'https://pjk.co.in/',
      RESEND_API_KEY: 'sk_live_wrong_provider_123',
      CONTACT_INBOX: 'not-an-email',
    })
    const text = problems.join('\n')
    expect(text).toMatch(/DATABASE_URL must be a postgres/)
    expect(text).toMatch(/PAYLOAD_SECRET is not set/)
    expect(text).toMatch(/NEXT_PUBLIC_SERVER_URL must not end with a slash/)
    expect(text).toMatch(/RESEND_API_KEY must be a Resend key/)
    expect(text).toMatch(/CONTACT_INBOX must be an email address/)
    expect(text).not.toContain('sk_live_wrong_provider_123')
    expect(text).not.toContain('not-postgres')
  })

  it('treats blank optional values as unset', () => {
    expect(parseEnv({ ...base, RESEND_API_KEY: '', BLOB_READ_WRITE_TOKEN: '  ' }).problems).toEqual(
      [],
    )
  })

  it('refuses a placeholder secret and warns about a short one', () => {
    expect(parseEnv({ ...base, PAYLOAD_SECRET: 'changeme' }).problems.join()).toMatch(
      /PAYLOAD_SECRET is too short/,
    )
    const short = parseEnv({ ...base, PAYLOAD_SECRET: 'y'.repeat(24) })
    expect(short.problems).toEqual([])
    expect(short.warnings.join()).toMatch(/PAYLOAD_SECRET is 24 characters/)
  })

  it('asks more of production', () => {
    const { problems } = parseEnv({
      ...base,
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SERVER_URL: 'http://pjk.co.in',
    })
    const text = problems.join('\n')
    expect(text).toMatch(/RESEND_API_KEY is required in production/)
    expect(text).toMatch(/BLOB_READ_WRITE_TOKEN is required in production/)
    expect(text).toMatch(/must use https/)

    expect(
      parseEnv({
        ...base,
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'https://pjk.co.in',
        RESEND_API_KEY: 're_example_not_real',
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_example_not_real',
      }).problems,
    ).toEqual([])
  })

  it('lets a preview run without production-only settings', () => {
    expect(parseEnv({ ...base, VERCEL_ENV: 'preview' }).problems).toEqual([])
  })

  it('reports problems as one readable error', () => {
    const error = new EnvError(['PAYLOAD_SECRET is not set'])
    expect(error.message).toMatch(/not set up correctly/)
    expect(error.message).toMatch(/- PAYLOAD_SECRET is not set/)
  })
})
