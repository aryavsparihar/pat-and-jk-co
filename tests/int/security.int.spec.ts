import { createHmac } from 'node:crypto'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isCompanyEmail, normaliseEmail } from '@/security/constants'
import { createGateToken, readGateToken, touchGateToken } from '@/security/gateToken'
import { createOtp, hashOtp, otpMatches, passwordProblem } from '@/security/otp'

const EMAIL = 'security-test@pjk.co.in'
const STRONG = 'Rw8-quiet-Forest-2026!'

describe('company email addresses', () => {
  it('accepts only well-formed company addresses', () => {
    expect(isCompanyEmail('aryaveer@pjk.co.in')).toBe(true)
    expect(isCompanyEmail('  Aryaveer@PJK.CO.IN ')).toBe(true)
    expect(isCompanyEmail('someone@gmail.com')).toBe(false)
    expect(isCompanyEmail('someone@notpjk.co.in')).toBe(false)
    expect(isCompanyEmail('aryaveer@pjk.co.in.evil.com')).toBe(false)
    expect(isCompanyEmail('not-an-email')).toBe(false)
    expect(isCompanyEmail(undefined)).toBe(false)
  })

  it('normalises case and spacing', () => {
    expect(normaliseEmail('  Foo@PJK.co.in ')).toBe('foo@pjk.co.in')
  })
})

describe('admin gate token', () => {
  it('round-trips a signed token', () => {
    const { token } = createGateToken(EMAIL)
    expect(readGateToken(token)?.email).toBe(EMAIL)
  })

  it('rejects tampering, rubbish and nothing at all', () => {
    const { token } = createGateToken(EMAIL)
    const [body, signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({ email: 'attacker@pjk.co.in', exp: 9e9, jti: 'x' }),
    ).toString('base64url')

    expect(readGateToken(`${forged}.${signature}`)).toBeNull()
    expect(readGateToken(`${body}.${signature.slice(0, -2)}xx`)).toBeNull()
    expect(readGateToken('nonsense')).toBeNull()
    expect(readGateToken(undefined)).toBeNull()
  })

  it('rejects an expired token', () => {
    const expired = Buffer.from(
      JSON.stringify({ email: EMAIL, exp: Math.floor(Date.now() / 1000) - 60, jti: 'x' }),
    ).toString('base64url')
    // Signed correctly, but out of date
    const { token } = createGateToken(EMAIL)
    const signature = token.split('.')[1]
    expect(readGateToken(`${expired}.${signature}`)).toBeNull()
  })
})

describe('admin gate token, idle limit', () => {
  const signed = (payload: object) => {
    // Re-sign a body the way the module does, for tokens from the past
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', process.env.PAYLOAD_SECRET!)
      .update(body)
      .digest('base64url')
    return `${body}.${signature}`
  }
  const now = () => Math.floor(Date.now() / 1000)

  it('ends after 30 minutes without activity, even inside its 12 hours', () => {
    const idle = signed({ email: EMAIL, exp: now() + 3600, jti: 'x', seen: now() - 31 * 60 })
    expect(readGateToken(idle)).toBeNull()
    const active = signed({ email: EMAIL, exp: now() + 3600, jti: 'x', seen: now() - 29 * 60 })
    expect(readGateToken(active)?.email).toBe(EMAIL)
  })

  it('is renewed by activity without moving its 12-hour end', () => {
    const old = readGateToken(
      signed({ email: EMAIL, exp: now() + 600, jti: 'x', seen: now() - 20 * 60 }),
    )!
    const renewed = readGateToken(touchGateToken(old))!
    expect(renewed.exp).toBe(old.exp)
    expect(renewed.seen).toBeGreaterThanOrEqual(now() - 1)
  })
})

describe('one-time codes', () => {
  it('are numeric, hashed with a salt, and compared exactly', () => {
    const code = createOtp()
    expect(code).toMatch(/^\d{6}$/)

    const hash = hashOtp(code, 'challenge-1')
    expect(hash).not.toContain(code)
    expect(otpMatches(code, 'challenge-1', hash)).toBe(true)
    expect(otpMatches(code, 'challenge-2', hash)).toBe(false) // different challenge
    expect(otpMatches('000000', 'challenge-1', hash)).toBe(false)
  })
})

describe('password rules', () => {
  it('accepts a strong password', () => {
    expect(passwordProblem(STRONG, EMAIL)).toBeNull()
  })

  it('rejects weak ones', () => {
    expect(passwordProblem('short1!A')).toMatch(/12 characters/)
    expect(passwordProblem('alllowercase1!')).toMatch(/capital/)
    expect(passwordProblem('ALLUPPERCASE1!')).toMatch(/lowercase/)
    expect(passwordProblem('NoNumbersHere!!')).toMatch(/number/)
    expect(passwordProblem('NoSymbolsHere12')).toMatch(/symbol/)
    expect(passwordProblem('Password1234!')).toMatch(/common/)
    expect(passwordProblem('Security-Test-99!', EMAIL)).toMatch(/email address/)
  })
})

describe('user accounts', () => {
  let payload: Payload
  const context = { disableRevalidate: true }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await cleanup()
  })
  afterAll(() => cleanup())

  async function cleanup() {
    await payload.delete({
      collection: 'users',
      where: { email: { contains: 'security-test' } },
      context,
    })
  }

  it('refuses accounts outside the company domain', async () => {
    await expect(
      payload.create({
        collection: 'users',
        context,
        data: {
          email: 'security-test@gmail.com',
          name: 'Nope',
          password: STRONG,
          roles: ['editor'],
        } as never,
      }),
    ).rejects.toThrow(/pjk\.co\.in/)
  })

  it('refuses weak passwords', async () => {
    await expect(
      payload.create({
        collection: 'users',
        context,
        data: { email: EMAIL, name: 'Weak', password: 'password123', roles: ['editor'] } as never,
      }),
    ).rejects.toThrow(/too weak/i)
  })

  it('blocks sign-in for a suspended account', async () => {
    await payload.create({
      collection: 'users',
      context,
      data: {
        email: EMAIL,
        name: 'Suspended',
        password: STRONG,
        roles: ['editor'],
        status: 'suspended',
      } as never,
    })

    await expect(
      payload.login({ collection: 'users', data: { email: EMAIL, password: STRONG } }),
    ).rejects.toThrow(/not active/i)
  })
})

describe('secrets from the environment', () => {
  it('match only the exact value, and an unset secret matches nothing', async () => {
    const { matchesSecret } = await import('@/security/secrets')
    expect(matchesSecret('s3cret-value', 's3cret-value')).toBe(true)
    expect(matchesSecret('s3cret-valuE', 's3cret-value')).toBe(false)
    expect(matchesSecret('', undefined)).toBe(false)
    expect(matchesSecret('', '')).toBe(false)
    expect(matchesSecret(null, '')).toBe(false)
  })
})
