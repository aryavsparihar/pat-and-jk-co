// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { REST_POST } from '@payloadcms/next/routes'

import { isBreachedPassword, sha1Hex } from '@/security/breachedPassword'
import { GATE_COOKIE } from '@/security/constants'
import { createGateToken } from '@/security/gateToken'

/*
 * Staff passwords: the breach check, and the reset flow from request to new password. Accounts
 * here are made up (staff-auth-test@pjk.co.in) and removed afterwards.
 */

const EMAIL = 'staff-auth-test@pjk.co.in'
const STRONG = 'Tq7-amber-Lantern-2026!'
const context = { disableRevalidate: true }

const rangeReply = (password: string, count: number) =>
  `0000000000000000000000000000000000A:0\n${sha1Hex(password).slice(5)}:${count}\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3\n`

describe('the breached-password check', () => {
  it('sends only the first five characters of the hash, and matches the rest here', async () => {
    const fetchImpl = vi.fn(async () => new Response(rangeReply('hunter2', 17)))
    expect(await isBreachedPassword('hunter2', { fetchImpl: fetchImpl as never })).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1Hex('hunter2').slice(0, 5)}`)
    expect(url).not.toContain('hunter2')
    expect(url).not.toContain(sha1Hex('hunter2').slice(5))
    expect((init.headers as Record<string, string>)['Add-Padding']).toBe('true')
  })

  it('ignores padding entries and passes a password that is not listed', async () => {
    const fetchImpl = vi.fn(async () => new Response(rangeReply('hunter2', 0)))
    expect(await isBreachedPassword('hunter2', { fetchImpl: fetchImpl as never })).toBe(false)
  })

  it('reports an unreachable service as unknown, not as a failure', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await isBreachedPassword(STRONG, { fetchImpl: down as never })).toBeNull()
    const error = vi.fn(async () => new Response('', { status: 503 }))
    expect(await isBreachedPassword(STRONG, { fetchImpl: error as never })).toBeNull()
  })
})

describe('staff accounts', () => {
  let payload: Payload

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await cleanup()
  })
  afterAll(async () => {
    vi.restoreAllMocks()
    await cleanup()
  })

  async function cleanup() {
    await payload.delete({ collection: 'users', where: { email: { equals: EMAIL } }, context })
  }

  /** Have I Been Pwned, answering as though `password` had been in a breach */
  const breachService = (password: string) =>
    vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(rangeReply(password, 52)))

  it('refuses a breached password when it is set, and allows it when the check cannot run', async () => {
    const spy = breachService(STRONG)
    await expect(
      payload.create({
        collection: 'users',
        context,
        data: { email: EMAIL, name: 'Breached', password: STRONG, roles: ['editor'] } as never,
      }),
    ).rejects.toThrow(/known data breach/)
    spy.mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })
    const warn = vi.spyOn(payload.logger, 'warn')
    const user = await payload.create({
      collection: 'users',
      context,
      data: { email: EMAIL, name: 'Allowed', password: STRONG, roles: ['editor'] } as never,
    })
    expect(user.id).toBeTruthy()
    expect(warn.mock.calls.some((c) => JSON.stringify(c).includes('check skipped'))).toBe(true)
    spy.mockRestore()
    warn.mockRestore()
  })

  it('resets a password once, within the hour, by the rules, and ends every session', async () => {
    const user = (
      await payload.find({ collection: 'users', where: { email: { equals: EMAIL } }, context })
    ).docs[0]!
    await payload.login({ collection: 'users', data: { email: EMAIL, password: STRONG } })
    const sessionIds = async () =>
      (
        (
          (await payload.findByID({ collection: 'users', id: user.id })) as {
            sessions?: { id: string }[]
          }
        ).sessions ?? []
      ).map((s) => s.id)
    const before = await sessionIds()
    expect(before.length).toBeGreaterThan(0)

    const token = await payload.forgotPassword({
      collection: 'users',
      data: { email: EMAIL },
      disableEmail: true,
    })
    expect(token).toBeTruthy()
    const stored = (await payload.db.findOne({
      collection: 'users',
      where: { id: { equals: user.id } },
    })) as unknown as { resetPasswordExpiration: string }
    const minutes = (new Date(stored.resetPasswordExpiration).getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(55)
    expect(minutes).toBeLessThanOrEqual(60)

    // The rules apply to a reset too
    await expect(
      payload.resetPassword({
        collection: 'users',
        data: { token: token!, password: 'password123' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/too weak/i)
    // And so does the breach check
    const spy = breachService('Nv4-copper-Meadow-2026?')
    await expect(
      payload.resetPassword({
        collection: 'users',
        data: { token: token!, password: 'Nv4-copper-Meadow-2026?' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/known data breach/)
    spy.mockRestore()

    const next = 'Kp2-silver-Harbour-2026#'
    await payload.resetPassword({
      collection: 'users',
      data: { token: token!, password: next },
      overrideAccess: true,
    })
    // Every earlier session is gone; the reset signs the person in afresh
    const after = await sessionIds()
    expect(after.filter((id) => before.includes(id))).toEqual([])
    expect(after.length).toBeLessThanOrEqual(1)
    // Used once: the same link cannot set another password
    await expect(
      payload.resetPassword({
        collection: 'users',
        data: { token: token!, password: 'Zm5-golden-Orchard-2026!' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/invalid or has expired/)
    const signedIn = await payload.login({
      collection: 'users',
      data: { email: EMAIL, password: next },
    })
    expect(signedIn.user?.email).toBe(EMAIL)
  })

  it('answers a reset request for an unknown address the same way, sending nothing', async () => {
    await expect(
      payload.forgotPassword({
        collection: 'users',
        data: { email: 'nobody-here@pjk.co.in' },
        disableEmail: true,
      }),
    ).resolves.toBeNull()
  })

  it('ends the other sessions when a password is changed from the account', async () => {
    const user = (
      await payload.find({ collection: 'users', where: { email: { equals: EMAIL } }, context })
    ).docs[0]!
    const current = (await payload.findByID({ collection: 'users', id: user.id })) as {
      sessions?: { id: string }[]
    }
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { password: 'Wd3-violet-Garden-2026&' } as never,
      context,
    })
    const after = (await payload.findByID({ collection: 'users', id: user.id })) as {
      sessions?: { id: string }[]
    }
    // Changed with no session of its own (here, a script): every session ends
    expect(current.sessions?.length ?? 0).toBeGreaterThan(0)
    expect(after.sessions ?? []).toHaveLength(0)
  })

  it('locks after five wrong passwords, logs it once, and tells the account holder', async () => {
    const post = REST_POST(config)
    const { token } = createGateToken(EMAIL)
    const attempt = (password: string) =>
      post(
        new Request('http://localhost:3000/api/users/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `${GATE_COOKIE}=${encodeURIComponent(token)}`,
            'x-forwarded-for': '198.51.100.77',
          },
          body: JSON.stringify({ email: EMAIL, password }),
        }),
        { params: Promise.resolve({ slug: ['users', 'login'] }) },
      )
    const since = new Date().toISOString()
    const info = vi.spyOn(payload.logger, 'info')
    for (let i = 0; i < 5; i++) expect((await attempt('Not-the-password-1!')).status).toBe(401)
    // Locked: even the right password is refused for now
    expect((await attempt('Wd3-violet-Garden-2026&')).status).toBe(401)
    expect((await attempt('Not-the-password-1!')).status).toBe(401)

    const events = async (event: string) =>
      (
        await payload.count({
          collection: 'security-events',
          where: {
            and: [
              { event: { equals: event } },
              { email: { equals: EMAIL } },
              { createdAt: { greater_than_equal: since } },
            ],
          },
        })
      ).totalDocs
    expect(await events('staff-sign-in-failed')).toBeGreaterThanOrEqual(5)
    expect(await events('staff-locked')).toBe(1)
    expect(
      info.mock.calls.some((c) => String(c[0]).includes('Your PJK admin account was locked')),
    ).toBe(true)
    info.mockRestore()
    const locked = (await payload.db.findOne({
      collection: 'users',
      where: { email: { equals: EMAIL } },
    })) as unknown as { lockUntil: string }
    const minutes = (new Date(locked.lockUntil).getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(14)
    expect(minutes).toBeLessThanOrEqual(15)
  })
})
