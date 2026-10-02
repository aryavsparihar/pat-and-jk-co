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
  const db = (payload.db as unknown as {
    drizzle: { execute: (q: SQL) => Promise<{ rows: unknown[] }> }
  }).drizzle
  const result = await db.execute(query)
  return result.rows as Row[]
}
