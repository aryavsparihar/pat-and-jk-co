import type { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** A statement built with the `sql` tag (drizzle-orm's, re-exported by the Postgres adapter) */
type SQL = ReturnType<typeof sql>

/**
 * Runs one raw statement on the Postgres connection underneath Payload. For the few writes that
 * must be a single atomic statement (counters, rate limits), where a read-then-write through the
 * Local API could lose an update to a concurrent request.
 */
export const execute = async <Row>(payload: Payload, query: SQL): Promise<Row[]> => {
  const db = (
    payload.db as unknown as {
      drizzle: { execute: (q: SQL) => Promise<{ rows: unknown[] }> }
    }
  ).drizzle
  const result = await db.execute(query)
  return result.rows as Row[]
}

/**
 * Runs one raw statement inside a Local API transaction (`req` from createLocalReq and
 * initTransaction), so it commits or rolls back with the Payload writes made with that `req`.
 * Outside a transaction it runs on its own, as `execute` does.
 */
export const executeIn = async <Row>(
  payload: Payload,
  req: { transactionID?: number | string | Promise<number | string> | null },
  query: SQL,
): Promise<Row[]> => {
  type Db = { execute: (q: SQL) => Promise<{ rows: unknown[] }> }
  const adapter = payload.db as unknown as { sessions?: Record<string, { db: Db }>; drizzle: Db }
  const id = await req.transactionID
  const db = (id && adapter.sessions?.[String(id)]?.db) || adapter.drizzle
  const result = await db.execute(query)
  return result.rows as Row[]
}
