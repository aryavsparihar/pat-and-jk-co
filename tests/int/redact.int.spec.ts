import { describe, expect, it } from 'vitest'

import { createLogger } from '@/observability/logger'
import { redact, redactString } from '@/observability/redact'

/*
 * Every value below is made up. The PAN and IFSC have the right shape and nothing more; the
 * account and Aadhaar numbers are sequences no bank or UIDAI would issue.
 */
const PAN = 'ABCPE1234F'
const IFSC = 'ABCD0123456'
const ACCOUNT = '123456789012345'
const AADHAAR = '1234 5678 9012'
const MOBILE = '+91 98765 43210'
const EMAIL = 'artist@example.test'

/** A logger writing into an array instead of stdout, to see exactly what would be logged */
const capture = () => {
  const lines: string[] = []
  const logger = createLogger({ write: (chunk: string) => void lines.push(chunk) })
  return { logger, output: () => lines.join('') }
}

describe('redacting personal data from text', () => {
  it.each([
    ['an email address', `sent to ${EMAIL} today`, 'sent to [email] today'],
    ['a PAN', `PAN ${PAN} received`, 'PAN [pan] received'],
    ['a lower-case PAN', `pan ${PAN.toLowerCase()}`, 'pan [pan]'],
    ['an IFSC', `branch ${IFSC}`, 'branch [ifsc]'],
    ['an account number', `account ${ACCOUNT}`, 'account [number]'],
    ['an Aadhaar number with spaces', `aadhaar ${AADHAAR}`, 'aadhaar [number]'],
    ['an Aadhaar number with hyphens', 'id 1234-5678-9012', 'id [number]'],
    ['an Indian mobile number', 'call 9876543210', 'call [number]'],
    ['an international number', `call ${MOBILE} now`, 'call [phone] now'],
  ])('removes %s', (_, input, expected) => {
    expect(redactString(input)).toBe(expected)
  })

  it('leaves ordinary log text alone', () => {
    for (const text of [
      'Migrated: 20261002_155740_add_rate_limits (2ms)',
      'request took 1234ms on 2026-10-02 15:19:06',
      'member AT000042 approved; application APP-7K3Q9X',
      'the last four digits are 9012',
      'GET /api/pages?depth=2 200',
      'listening on 127.0.0.1:5432',
    ]) {
      expect(redactString(text)).toBe(text)
    }
  })
})

describe('redacting structured values', () => {
  it('reaches into nested objects, arrays and errors without touching the original', () => {
    const input = {
      member: { email: EMAIL, note: `PAN is ${PAN}` },
      accounts: [ACCOUNT],
      accountNumber: 1234567890123,
      count: 42,
    }
    const output = redact(input)
    expect(JSON.stringify(output)).not.toMatch(/example\.test|ABCPE|123456789012/)
    expect(output.count).toBe(42)
    expect(input.member.email).toBe(EMAIL)
  })

  it('redacts by key name even when the value would not look sensitive', () => {
    expect(redact({ password: 'hunter2', otp: '123456', ifsc: 'x', name: 'Asha' })).toEqual({
      password: '[redacted]',
      otp: '[redacted]',
      ifsc: '[redacted]',
      name: 'Asha',
    })
  })

  it('drops an e-Aadhaar PDF password, under any of its names', () => {
    const output = JSON.stringify(
      redact({ aadhaarPassword: 'MADE1990', body: { password: 'MADE1990' }, other: 'kept' }),
    )
    expect(output).not.toContain('MADE1990')
    expect(output).toContain('kept')
  })

  it('copes with cycles', () => {
    const a: Record<string, unknown> = { email: EMAIL }
    a.self = a
    expect(() => JSON.stringify(redact(a))).not.toThrow()
  })
})

describe('the logger', () => {
  it('never writes a PAN, wherever it appears in a log call', () => {
    const { logger, output } = capture()
    logger.info(`Verifying PAN ${PAN}`)
    logger.info({ pan: PAN, detail: `holder PAN ${PAN}` }, 'kyc received')
    logger.error({ err: new Error(`PAN ${PAN} did not match`) }, 'verification failed')
    logger.warn(new Error(`bad PAN ${PAN.toLowerCase()}`))

    const text = output()
    expect(text).toContain('kyc received')
    expect(text).toContain('[pan]')
    expect(text.toUpperCase()).not.toContain(PAN)
  })

  it('never writes bank details, Aadhaar, phone numbers or email addresses', () => {
    const { logger, output } = capture()
    logger.info(
      { account: ACCOUNT, ifscCode: IFSC, phone: MOBILE },
      `payout to ${ACCOUNT} at ${IFSC} for ${EMAIL}, aadhaar ${AADHAAR}, mobile ${MOBILE}`,
    )
    const text = output()
    for (const secret of [ACCOUNT, IFSC, EMAIL, AADHAAR, MOBILE, '98765']) {
      expect(text).not.toContain(secret)
    }
  })

  it('keeps the error itself useful', () => {
    const { logger, output } = capture()
    logger.error({ err: new TypeError(`cannot read row for ${EMAIL}`) }, 'lookup failed')
    const line = JSON.parse(output().trim().split('\n').pop()!)
    expect(line.msg).toBe('lookup failed')
    expect(line.err.type).toBe('TypeError')
    expect(line.err.message).toBe('cannot read row for [email]')
    expect(line.err.stack).toContain('TypeError')
  })
})

describe('credentials in log lines', () => {
  it('are removed from connection strings, headers, tokens and keys', async () => {
    const { redactString } = await import('@/observability/redact')
    // A made-up token, put together here so the repository holds nothing shaped like a real one
    const b64 = (value: string) => Buffer.from(value).toString('base64url')
    const jwt = `${b64('{"alg":"HS256"}')}.${b64('{"sub":"made-up"}')}.${b64('not-a-signature')}`
    const line = [
      'connect failed: postgres://neondb_owner:pw-Example-123@ep-made-up.neon.tech/neondb',
      'Authorization: Bearer abc.def-123456789',
      `token ${jwt}`,
      'key re_FAKEFAKEFAKEFAKEFAKE1234 and vercel_blob_rw_FAKEFAKEFAKEFAKE1234',
    ].join(' | ')
    const out = redactString(line)
    for (const secret of [
      'pw-Example-123',
      'neondb_owner',
      'abc.def-123456789',
      jwt,
      're_FAKEFAKE',
      'vercel_blob_rw_FAKE',
    ])
      expect(out).not.toContain(secret)
    expect(out).toContain('postgres://[credentials]@ep-made-up.neon.tech/neondb')
  })
})
