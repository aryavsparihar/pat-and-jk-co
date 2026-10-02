import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { protectSubmission } from '@/collections/FormSubmissions/overrides'
import { hitLimit, hitLimits, rateLimitKey } from '@/security/rateLimit'
import { execute } from '@/utilities/sql'

let payload: Payload
const SCOPE = 'int-test'
// From the documentation range, so it can never be a real visitor
const FORM_IP = '192.0.2.77'

const cleanup = async () => {
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE ${`${SCOPE}%`}`)
  await execute(
    payload,
    sql`DELETE FROM rate_limits WHERE key = ${rateLimitKey('form-submit', FORM_IP)}`,
  )
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
})

afterAll(async () => {
  await cleanup()
})

const unique = () => `subject-${Math.random().toString(36).slice(2)}`

describe('rate limits held in Postgres', () => {
  it('lets exactly the allowance through when requests arrive at once', async () => {
    const subject = unique()
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        hitLimit(payload, { scope: SCOPE, subject, max: 5, windowSeconds: 60 }),
      ),
    )
    expect(results.filter((r) => r.allowed)).toHaveLength(5)
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    )
    const refused = results.find((r) => !r.allowed)
    expect(refused?.retryAfter).toBeGreaterThan(0)
    expect(refused?.retryAfter).toBeLessThanOrEqual(60)
  })

  it('starts a new window once the old one runs out', async () => {
    const subject = unique()
    const limit = { scope: SCOPE, subject, max: 1, windowSeconds: 1 }
    expect((await hitLimit(payload, limit)).allowed).toBe(true)
    expect((await hitLimit(payload, limit)).allowed).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const fresh = await hitLimit(payload, limit)
    expect(fresh.allowed).toBe(true)
    expect(fresh.count).toBe(1)
  })

  it('counts each subject and scope separately', async () => {
    const a = unique()
    const b = unique()
    await hitLimit(payload, { scope: SCOPE, subject: a, max: 1, windowSeconds: 60 })
    expect(
      (await hitLimit(payload, { scope: SCOPE, subject: b, max: 1, windowSeconds: 60 })).allowed,
    ).toBe(true)
    expect(
      (await hitLimit(payload, { scope: `${SCOPE}-other`, subject: a, max: 1, windowSeconds: 60 }))
        .allowed,
    ).toBe(true)
  })

  it('refuses when any one of several limits is exceeded', async () => {
    const email = unique()
    const ip = unique()
    const limits = (max: number) => [
      { scope: SCOPE, subject: email, max, windowSeconds: 60 },
      { scope: `${SCOPE}-ip`, subject: ip, max: 100, windowSeconds: 60 },
    ]
    expect((await hitLimits(payload, limits(1))).allowed).toBe(true)
    expect((await hitLimits(payload, limits(1))).allowed).toBe(false)
  })

  it('never stores the subject itself', async () => {
    const subject = 'someone@example.test'
    await hitLimit(payload, { scope: SCOPE, subject, max: 5, windowSeconds: 60 })
    const rows = await execute<{ key: string }>(
      payload,
      sql`SELECT key FROM rate_limits WHERE key LIKE ${`${SCOPE}:%`}`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((r) => r.key.includes('example'))).toBe(false)
    expect(rows.map((r) => r.key)).toContain(rateLimitKey(SCOPE, subject))
    // Case and spacing do not create a second counter for the same address
    expect(rateLimitKey(SCOPE, ' Someone@Example.TEST ')).toBe(rateLimitKey(SCOPE, subject))
  })
})

describe('public form submissions', () => {
  it('are limited per address across requests, whichever instance they reach', async () => {
    // A request as it arrives over HTTP: no user, a client address, not the Local API
    const req = {
      payload,
      payloadAPI: 'REST',
      user: null,
      headers: new Headers({ 'x-forwarded-for': FORM_IP }),
    }
    const submit = () =>
      protectSubmission({ data: { submissionData: [] }, operation: 'create', req } as never)

    // The first five get as far as validation (no form given), the sixth is turned away
    for (let i = 0; i < 5; i++) await expect(submit()).rejects.toThrow(/Missing form/)
    await expect(submit()).rejects.toThrow(/Too many messages/)
  })
})
