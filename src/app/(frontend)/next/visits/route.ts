import configPromise from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'

import { clientIp } from '@/security/constants'
import { getTenantByHost } from '@/utilities/tenant'

export const dynamic = 'force-dynamic'

/**
 * The running visit total shown at the foot of the site.
 *
 *   GET   → the current number
 *   POST  → count this visit, then the current number
 *
 * Pages are served as cached static HTML, so the number cannot be rendered with them; the
 * footer asks for it once the page is open. A browser counts itself once per session
 * (see VisitorCount.tsx), and this route ignores robots and repeat calls from the same
 * address for a while, so a reload or a crawl does not inflate the tally.
 *
 * Nothing is stored about the visitor: no cookie, no address, no identifier — only the brand's
 * total moves. That makes the number approximate, which is what a visitor count has always been.
 */

const REPEAT_WINDOW_MS = 20 * 60 * 1000
const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|headless|lighthouse|python-requests/i

// Per-instance and short-lived. A baseline against a single address counting itself repeatedly,
// not a guarantee — several serverless instances each keep their own.
const lastSeen = new Map<string, number>()

const countedRecently = (ip: string): boolean => {
  const now = Date.now()
  if (lastSeen.size > 5000) lastSeen.clear()
  const previous = lastSeen.get(ip)
  lastSeen.set(ip, now)
  return previous !== undefined && now - previous < REPEAT_WINDOW_MS
}

/** The Postgres handle underneath Payload, for an increment that cannot lose a concurrent visit. */
const drizzleOf = (payload: Payload) =>
  (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: unknown[] }> } })
    .drizzle

const totalFor = async (payload: Payload, tenantId: number): Promise<number> => {
  const found = await payload.find({
    collection: 'visitor-counts',
    where: { tenant: { equals: tenantId } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.total ?? 0
}

export async function GET(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const tenant = await getTenantByHost(request.headers.get('host') ?? '')
  if (!tenant) return Response.json({ total: 0 })

  return Response.json({ total: await totalFor(payload, tenant.id) })
}

export async function POST(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const tenant = await getTenantByHost(request.headers.get('host') ?? '')
  if (!tenant) return Response.json({ total: 0 })

  const agent = request.headers.get('user-agent') ?? ''
  const skip = !agent || BOT.test(agent) || countedRecently(clientIp(request.headers))
  if (skip) return Response.json({ total: await totalFor(payload, tenant.id) })

  const updated = (await drizzleOf(payload).execute(
    sql`UPDATE visitor_counts SET total = total + 1, updated_at = now()
        WHERE tenant_id = ${tenant.id} RETURNING total`,
  )) as { rows: { total: number | string }[] }

  const row = updated.rows[0]
  if (row) return Response.json({ total: Number(row.total) })

  // First visit this brand has ever had. Only one row per brand is allowed, so if another
  // request opened the tally a moment ago, read whatever it wrote instead.
  try {
    const created = await payload.create({
      collection: 'visitor-counts',
      data: { total: 1, tenant: tenant.id },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    return Response.json({ total: created.total })
  } catch {
    return Response.json({ total: await totalFor(payload, tenant.id) })
  }
}
