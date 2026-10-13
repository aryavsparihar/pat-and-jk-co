// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { isBreachedPassword, sha1Hex } from '@/security/breachedPassword'

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
})
