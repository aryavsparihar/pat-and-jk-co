import configPromise from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import { execute } from '@/utilities/sql'

export const dynamic = 'force-dynamic'

/** How long the database may take to answer before the site is reported as down */
const DATABASE_TIMEOUT_MS = 3000

/**
 * For uptime monitors: is the site up, and can it reach its database?
 *
 *   200 {"status":"ok", …}        everything answers
 *   503 {"status":"degraded", …}  the site is up but the database is not answering
 *
 * Deliberately says nothing else: no versions of dependencies, no counts, no configuration, no
 * error text. The commit is included because it is already public in the deployment URL and
 * tells you at a glance which deploy is live.
 */
const check = async () => {
  const started = Date.now()
  let database: 'ok' | 'unreachable' = 'unreachable'

  try {
    const payload = await getPayload({ config: configPromise })
    await Promise.race([
      execute(payload, sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('database timeout')), DATABASE_TIMEOUT_MS),
      ),
    ])
    database = 'ok'
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'health check failed',
        reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      }),
    )
  }

  const ok = database === 'ok'
  return {
    ok,
    body: {
      status: ok ? 'ok' : 'degraded',
      database,
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
      responseMs: Date.now() - started,
    },
  }
}

const headers = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const { ok, body } = await check()
  return Response.json(body, { status: ok ? 200 : 503, headers })
}

export async function HEAD() {
  const { ok } = await check()
  return new Response(null, { status: ok ? 200 : 503, headers })
}
