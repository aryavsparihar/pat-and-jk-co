// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST } from '@/app/(frontend)/next/visits/route'
import { execute } from '@/utilities/sql'

/* The visitor count: once per address in 20 minutes, from the site's own pages, never robots */

let payload: Payload
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
// A brand of the test's own, so the count does not depend on what the database already holds
const host = 'visits-test.localhost'
const SLUG = 'visits-test'

const visit = (ip: string, headers: Record<string, string> = {}) =>
  POST(
    new Request(`${ORIGIN}/next/visits`, {
      method: 'POST',
      headers: {
        host,
        origin: ORIGIN,
        'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605',
        'x-forwarded-for': ip,
        ...headers,
      },
    }),
  ).then(async (r) => ((await r.json()) as { total: number }).total)

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'visit:%'`)
  await payload.delete({
    collection: 'tenants',
    where: { slug: { equals: SLUG } },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'tenants',
    data: { name: 'Visits test', slug: SLUG, domains: [{ domain: host }] },
    overrideAccess: true,
  })
})

afterAll(async () => {
  await payload.delete({
    collection: 'tenants',
    where: { slug: { equals: SLUG } },
    overrideAccess: true,
  })
})

describe('the visitor count', () => {
  it('counts an address once, ignores repeats, robots and other sites', async () => {
    const before = await visit('203.0.113.200', { 'user-agent': 'Googlebot' })
    expect(await visit('203.0.113.201')).toBe(before + 1)
    expect(await visit('203.0.113.201')).toBe(before + 1)
    expect(await visit('203.0.113.202', { origin: 'https://elsewhere.example' })).toBe(before + 1)
    expect(await visit('203.0.113.203')).toBe(before + 2)
  })
})
