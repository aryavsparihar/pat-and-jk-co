import { redactString } from '@/observability/redact'
import configPromise from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import { isStaff } from '@/access/roles'
import { checkContent } from '@/health/content'
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
 *
 * Staff, signed in to the admin, can add ?deep=1 to also check that every record the site needs
 * is there (src/health/content.ts): the answer then lists anything missing. Anyone else asking for
 * it is refused.
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
        // A database error can name the host or the user; the logger's redaction removes them
        reason: error instanceof Error ? redactString(error.message).slice(0, 200) : 'unknown',
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

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('deep') === '1') return deep(request)
  const { ok, body } = await check()
  return Response.json(body, { status: ok ? 200 : 503, headers })
}

const deep = async (request: Request) => {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!isStaff(user)) {
    return Response.json({ message: 'Sign in to the admin first.' }, { status: 401, headers })
  }
  const { ok, body } = await check()
  const content = await checkContent(payload)
  return Response.json({ ...body, content }, { status: ok && content.ok ? 200 : 503, headers })
}

export async function HEAD() {
  const { ok } = await check()
  return new Response(null, { status: ok ? 200 : 503, headers })
}
