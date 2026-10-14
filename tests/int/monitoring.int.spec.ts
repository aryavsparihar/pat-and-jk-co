// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { logSecurityEvent } from '@/security/events'
import { hitLimit } from '@/security/rateLimit'
import { execute } from '@/utilities/sql'

/*
 * What the security log records beyond sign-ins (rate-limit refusals, refused requests) and the
 * alert to the technical inbox when trouble passes a threshold within an hour.
 */

let payload: Payload
const MARK = 'monitoring-test'

const events = async (event: string, since: string) =>
  (
    await payload.count({
      collection: 'security-events',
      where: { and: [{ event: { equals: event } }, { createdAt: { greater_than_equal: since } }] },
      overrideAccess: true,
    })
  ).totalDocs

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})
afterAll(async () => {
  await execute(
    payload,
    sql`DELETE FROM security_events WHERE email LIKE ${`%${MARK}%`} OR detail LIKE ${`%${MARK}%`} OR event = 'alert-sent'`,
  )
})

describe('the security log and its alerts', () => {
  it('records the first refusal of each rate-limit window, once', async () => {
    const since = new Date().toISOString()
    const limit = { scope: `${MARK}-scope`, subject: `${Date.now()}`, max: 2, windowSeconds: 60 }
    for (let i = 0; i < 6; i++) await hitLimit(payload, limit)
    const logged = await payload.find({
      collection: 'security-events',
      where: {
        and: [{ event: { equals: 'rate-limited' } }, { createdAt: { greater_than_equal: since } }],
      },
      overrideAccess: true,
    })
    expect(logged.docs.filter((d) => d.detail === `${MARK}-scope`)).toHaveLength(1)
  })

  it('records a refused request to a staff-only action, with who and what', async () => {
    const since = new Date().toISOString()
    const reveal = payload.collections['kyc-records'].config.endpoints
      ? (payload.collections['kyc-records'].config.endpoints || []).find(
          (e) => e.path === '/:id/reveal',
        )!.handler
      : null!
    // A real editor account: the log records who was refused, by reference to them
    const email = `${MARK}-editor@pjk.co.in`
    await payload.delete({
      collection: 'users',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
    const editor = await payload.create({
      collection: 'users',
      data: {
        email,
        name: 'Monitoring test',
        roles: ['editor'] as never,
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      },
      overrideAccess: true,
    })
    const response = await reveal({
      user: { ...editor, collection: 'users' },
      payload,
      routeParams: { id: '1' },
      method: 'POST',
      url: 'http://localhost:3000/api/kyc-records/1/reveal',
      headers: new Headers({ 'x-forwarded-for': '198.51.100.250' }),
      json: async () => ({}),
    } as never)
    expect(response.status).toBe(403)
    const logged = await payload.find({
      collection: 'security-events',
      where: {
        and: [
          { event: { equals: 'access-refused' } },
          { createdAt: { greater_than_equal: since } },
        ],
      },
      overrideAccess: true,
    })
    expect(logged.docs.some((d) => d.detail?.includes('/api/kyc-records/1/reveal (users)'))).toBe(
      true,
    )
    await payload.delete({ collection: 'users', id: editor.id, overrideAccess: true })
  })

  it('emails the technical inbox once an hour when failed sign-ins pass the threshold', async () => {
    await execute(payload, sql`DELETE FROM security_events WHERE event = 'alert-sent'`)
    const since = new Date().toISOString()
    const warn = vi.spyOn(payload.logger, 'warn')
    for (let i = 0; i < 21; i++) {
      await logSecurityEvent(payload, {
        event: 'staff-sign-in-failed',
        email: `${MARK}-${i}@pjk.co.in`,
      })
      // The alarm looks at most once a minute; let it look now
      if (i === 19) vi.setSystemTime(Date.now() + 61_000)
    }
    vi.useRealTimers()
    expect(await events('alert-sent', since)).toBe(1)
    expect(warn.mock.calls.some((c) => JSON.stringify(c).includes('PJK security alert'))).toBe(true)
    // Not again within the hour
    vi.setSystemTime(Date.now() + 120_000)
    await logSecurityEvent(payload, { event: 'staff-sign-in-failed', email: `${MARK}-x@pjk.co.in` })
    vi.useRealTimers()
    expect(await events('alert-sent', since)).toBe(1)
    warn.mockRestore()
  })
})
