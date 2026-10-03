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
