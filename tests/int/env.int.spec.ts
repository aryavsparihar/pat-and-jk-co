import { describe, expect, it } from 'vitest'

import { EnvError, parseEnv } from '@/env'

// Obviously fake values: none of these is a real secret or a real database
const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/example',
  PAYLOAD_SECRET: 'x'.repeat(64),
}

/** A made-up 32-byte key: the same byte repeated */
const fakeKey = (byte: number) => Buffer.alloc(32, byte).toString('base64')

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
    expect(text).toMatch(/MEMBER_SESSION_SECRET is required in production/)
    expect(text).toMatch(/KYC_ENCRYPTION_KEY is required in production/)
    expect(text).toMatch(/KYC_STORE_ID is required in production/)
    expect(text).toMatch(/TURNSTILE_SECRET_KEY is required in production/)
    expect(text).toMatch(/NEXT_PUBLIC_TURNSTILE_SITE_KEY is required in production/)
    expect(text).toMatch(/must use https/)

    expect(
      parseEnv({
        ...base,
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SERVER_URL: 'https://pjk.co.in',
        RESEND_API_KEY: 're_example_not_real',
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_example_not_real',
        MEMBER_SESSION_SECRET: 'z'.repeat(44),
        KYC_ENCRYPTION_KEY: fakeKey(1),
        KYC_BLIND_INDEX_KEY: fakeKey(2),
        KYC_STORE_ID: 'store_exampleKycNotReal',
        // Cloudflare's published test keys
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
        TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
      }).problems,
    ).toEqual([])
  })

  it('lets a preview run without production-only settings', () => {
    expect(parseEnv({ ...base, VERCEL_ENV: 'preview' }).problems).toEqual([])
  })

  it('checks the KYC keys: the right size, and never the same key twice', () => {
    expect(parseEnv({ ...base, KYC_ENCRYPTION_KEY: 'too-short' }).problems.join()).toMatch(
      /KYC_ENCRYPTION_KEY must be 32 bytes/,
    )
    const same = parseEnv({
      ...base,
      KYC_ENCRYPTION_KEY: fakeKey(3),
      KYC_BLIND_INDEX_KEY: fakeKey(3),
    })
    expect(same.problems.join()).toMatch(/different key/)
    expect(same.problems.join()).not.toContain(fakeKey(3))
    expect(
      parseEnv({ ...base, KYC_ENCRYPTION_KEY: fakeKey(4), KYC_ENCRYPTION_KEY_PREVIOUS: fakeKey(4) })
        .problems,
    ).toHaveLength(1)
    expect(
      parseEnv({
        ...base,
        BLOB_STORE_ID: 'store_exampleMediaNotReal',
        KYC_STORE_ID: 'store_EXAMPLEMEDIANOTREAL',
      }).problems.join(),
    ).toMatch(/not the public media store/)
    expect(parseEnv({ ...base, KYC_STORE_ID: 'vercel_blob_rw_x' }).problems.join()).toMatch(
      /must be a Blob store ID/,
    )
  })

  it('reports problems as one readable error', () => {
    const error = new EnvError(['PAYLOAD_SECRET is not set'])
    expect(error.message).toMatch(/not set up correctly/)
    expect(error.message).toMatch(/- PAYLOAD_SECRET is not set/)
  })
})
