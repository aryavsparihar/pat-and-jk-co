import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as requestCode } from '@/app/(frontend)/next/members/request-code/route'
import { protectSubmission } from '@/collections/FormSubmissions/overrides'
import { createFormToken } from '@/members/formToken'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/security/turnstile'
import { execute } from '@/utilities/sql'
import { sql } from '@payloadcms/db-postgres'

/*
 * Cloudflare Turnstile on the server. Cloudflare itself is stood in for: each test says what
 * its verification endpoint answers. The keys are Cloudflare's published test keys, and every
 * address is made up at @turnstile.example.test and removed afterwards.
 */

let payload: Payload
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const DOMAIN = '@turnstile.example.test'
const SECRET = '1x0000000000000000000000000000000AA'
const withKey = { ...process.env, TURNSTILE_SECRET_KEY: SECRET }
// Shaped like a real secret, which production uses; made up
const withRealKey = { ...process.env, TURNSTILE_SECRET_KEY: '0x4AAAAAAexample-not-a-real-secret' }

/** What Cloudflare's siteverify answers, for one call */
const cloudflare = (answer: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(answer), { status })) as unknown as typeof fetch

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await execute(payload, sql`DELETE FROM login_challenges WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE ${`member-%${DOMAIN}`}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TURNSTILE_SECRET_KEY
})

afterAll(async () => {
  await cleanup()
})

describe('the Turnstile check', () => {
  it('is skipped where no secret is set', async () => {
    const fetchImpl = cloudflare({ success: false })
    expect(
      await verifyTurnstile(undefined, 'signin', { env: {} as NodeJS.ProcessEnv, fetchImpl }),
    ).toEqual({
      ok: true,
      checked: false,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a missing token without asking Cloudflare', async () => {
    const fetchImpl = cloudflare({ success: true, action: 'signin' })
    expect(await verifyTurnstile('', 'signin', { env: withKey, fetchImpl })).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts a genuine token earned on the same form', async () => {
    const fetchImpl = cloudflare({ success: true, action: 'contact' })
    expect(await verifyTurnstile('token', 'contact', { env: withKey, fetchImpl })).toEqual({
      ok: true,
      checked: true,
    })
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    // Only the secret and the token are sent: no IP address, nothing about the person
    expect([...(init.body as URLSearchParams).keys()]).toEqual(['secret', 'response'])
  })

  it('refuses a token from another form, or one Cloudflare rejects', async () => {
    expect(
      await verifyTurnstile('token', 'apply-artist', {
        env: withRealKey,
        fetchImpl: cloudflare({ success: true, action: 'contact' }),
      }),
    ).toEqual({ ok: false, reason: 'wrong-form' })
    expect(
      await verifyTurnstile('token', 'signin', {
        env: withKey,
        fetchImpl: cloudflare({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
      }),
    ).toEqual({ ok: false, reason: 'timeout-or-duplicate' })
  })

  it('takes Cloudflare’s test keys on a preview, and only those, without the form’s name', async () => {
    const placeholder = cloudflare({ success: true, action: '' })
    expect(
      await verifyTurnstile('token', 'signin', { env: withKey, fetchImpl: placeholder }),
    ).toEqual({
      ok: true,
      checked: true,
    })
    expect(
      await verifyTurnstile('token', 'signin', { env: withRealKey, fetchImpl: placeholder }),
    ).toEqual({
      ok: false,
      reason: 'wrong-form',
    })
  })

  it('lets a request through, noted, when Cloudflare cannot be reached', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await verifyTurnstile('token', 'signin', { env: withKey, fetchImpl: down })).toEqual({
      ok: true,
      checked: false,
      note: 'unreachable: TypeError',
    })
    expect(
      await verifyTurnstile('token', 'signin', { env: withKey, fetchImpl: cloudflare({}, 502) }),
    ).toEqual({ ok: true, checked: false, note: 'unreachable: 502' })
  })
})

describe('where it is checked', () => {
  const ask = (body: Record<string, unknown>) =>
    requestCode(
      new Request(`${ORIGIN}/next/members/request-code`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          'x-forwarded-for': '198.51.100.201',
        },
        body: JSON.stringify({
          purpose: 'signin',
          formToken: createFormToken(Date.now() - 10_000),
          ...body,
        }),
      }),
    )

  it('a sign-in code is only sent once the check has passed', async () => {
    process.env.TURNSTILE_SECRET_KEY = SECRET
    vi.stubGlobal('fetch', cloudflare({ success: true, action: 'signin' }))

    const refused = await ask({ email: `nobody${DOMAIN}` })
    expect(refused.status).toBe(400)
    expect((await refused.json()).retryCheck).toBe(true)
    // And the refusal is in the security log, not only in a log that lasts an hour
    const logged = await payload.count({
      collection: 'security-events',
      where: {
        and: [{ event: { equals: 'bot-check-failed' } }, { email: { equals: `nobody${DOMAIN}` } }],
      },
      overrideAccess: true,
    })
    expect(logged.totalDocs).toBe(1)

    const passed = await ask({ email: `somebody${DOMAIN}`, [TURNSTILE_FIELD]: 'token' })
    expect(passed.status).toBe(200)
    expect((await passed.json()).challengeId).toBeTruthy()
  })

  it('a public form is refused without it, before anything is stored', async () => {
    process.env.TURNSTILE_SECRET_KEY = SECRET
    const req = {
      user: null,
      payloadAPI: 'REST',
      payload,
      headers: new Headers({ 'x-forwarded-for': '198.51.100.202' }),
    }
    const submit = (submissionData: unknown[]) =>
      protectSubmission({
        data: { submissionData },
        operation: 'create',
        req,
      } as never)

    await expect(submit([{ field: 'message', value: 'Hello' }])).rejects.toThrow(
      /could not confirm this came from a person/,
    )

    // With a genuine token it gets past the check, to the form itself (none here)
    vi.stubGlobal('fetch', cloudflare({ success: true, action: 'contact' }))
    await expect(
      submit([
        { field: 'message', value: 'Hello' },
        { field: TURNSTILE_FIELD, value: 'token' },
      ]),
    ).rejects.toThrow(/Missing form/)
  })
})

/**
 * A stand-in for Cloudflare's siteverify that behaves as Cloudflare documents it: a token is
 * genuine only if Cloudflare issued it, it carries the action and hostname it was earned with, it is
 * spent the first time it is verified, and it expires after five minutes.
 */
const fakeCloudflare = () => {
  const issued = new Map<string, { action: string; hostname: string; at: number }>()
  const spent = new Set<string>()
  let now = Date.now()
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    expect(String(url)).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const token = (init?.body as URLSearchParams).get('response') ?? ''
    const known = issued.get(token)
    const answer = (body: object) => new Response(JSON.stringify(body), { status: 200 })
    if (!known) return answer({ success: false, 'error-codes': ['invalid-input-response'] })
    if (spent.has(token) || now - known.at > 300_000)
      return answer({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    spent.add(token)
    return answer({ success: true, action: known.action, hostname: known.hostname })
  }) as unknown as typeof fetch
  return {
    fetchImpl,
    /** What the widget hands the browser, earned on a form and a site */
    earn: (action: string, hostname = 'localhost') => {
      const token = `token-${Math.random().toString(36).slice(2)}`
      issued.set(token, { action, hostname, at: now })
      return token
    },
    later: (ms: number) => {
      now += ms
    },
  }
}

describe('a token is real, single-use and short-lived', () => {
  // A production-shaped secret, so the action and hostname are compared as in production
  const env = withRealKey

  it('is verified with Cloudflare, and accepted once on its own form and site', async () => {
    const cf = fakeCloudflare()
    const token = cf.earn('signin', 'pjk.co.in')
    const check = () =>
      verifyTurnstile(token, 'signin', { env, fetchImpl: cf.fetchImpl, hostname: 'pjk.co.in' })
    expect(await check()).toEqual({ ok: true, checked: true })
    expect(await check()).toEqual({ ok: false, reason: 'timeout-or-duplicate' })
    expect(cf.fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('refuses a token that has expired', async () => {
    const cf = fakeCloudflare()
    const token = cf.earn('contact')
    cf.later(301_000)
    expect(
      await verifyTurnstile(token, 'contact', {
        env,
        fetchImpl: cf.fetchImpl,
        hostname: 'localhost',
      }),
    ).toEqual({ ok: false, reason: 'timeout-or-duplicate' })
  })

  it('refuses a forged token, one from another form, and one from another site', async () => {
    const cf = fakeCloudflare()
    const verify = (token: string, action: 'signin' | 'contact', hostname = 'pjk.co.in') =>
      verifyTurnstile(token, action, { env, fetchImpl: cf.fetchImpl, hostname })
    expect(await verify('made-up-token', 'signin')).toEqual({
      ok: false,
      reason: 'invalid-input-response',
    })
    expect(await verify(cf.earn('contact', 'pjk.co.in'), 'signin')).toEqual({
      ok: false,
      reason: 'wrong-form',
    })
    expect(await verify(cf.earn('signin', 'elsewhere.example'), 'signin')).toEqual({
      ok: false,
      reason: 'wrong-site',
    })
  })

  it('the code request sends nothing without a fresh token from this site', async () => {
    process.env.TURNSTILE_SECRET_KEY = env.TURNSTILE_SECRET_KEY
    const cf = fakeCloudflare()
    vi.stubGlobal('fetch', cf.fetchImpl)
    const host = new URL(ORIGIN).hostname
    const ask = (token: string | undefined, email: string) =>
      requestCode(
        new Request(`${ORIGIN}/next/members/request-code`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: ORIGIN,
            'x-forwarded-for': '198.51.100.203',
          },
          body: JSON.stringify({
            purpose: 'signin',
            email,
            formToken: createFormToken(Date.now() - 10_000),
            ...(token ? { [TURNSTILE_FIELD]: token } : {}),
          }),
        }),
      )

    expect((await ask(undefined, `none${DOMAIN}`)).status).toBe(400)
    expect((await ask('forged', `forged${DOMAIN}`)).status).toBe(400)
    expect((await ask(cf.earn('signin', 'elsewhere.example'), `other${DOMAIN}`)).status).toBe(400)
    const token = cf.earn('signin', host)
    expect((await ask(token, `first${DOMAIN}`)).status).toBe(200)
    expect((await ask(token, `again${DOMAIN}`)).status).toBe(400)

    const reached = await payload.find({
      collection: 'login-challenges',
      where: {
        email: { in: ['none', 'forged', 'other', 'first', 'again'].map((n) => `${n}${DOMAIN}`) },
      },
      overrideAccess: true,
    })
    // Only the one genuine, fresh, same-site request got as far as a challenge
    expect(reached.docs.map((d) => d.email)).toEqual([`first${DOMAIN}`])
  })
})
