import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { execute } from '@/utilities/sql'

/**
 * The running site must not connect to the database as its owner (docs/SETUP.md, "Database
 * roles"): the owner can change or drop any table, and is exempt from Row-Level Security. Only
 * migrations, at build time, use the owner (DATABASE_URL_MIGRATE).
 *
 * Once DATABASE_URL_MIGRATE is set, which is how the split is switched on, a production server
 * connected as the owner (or as any role that can create tables, owns one, or bypasses RLS)
 * refuses to start. Before that, it warns, so the site keeps running while the app role is set up.
 * The migration step itself sets PAYLOAD_MIGRATING=1 and is not checked.
 */
export const checkDatabaseRole = async (payload: Payload): Promise<void> => {
  if (process.env.PAYLOAD_MIGRATING === '1') return
  const [row] = await execute<{
    name: string
    superuser: boolean
    bypass: boolean
    can_create: boolean
    owns: boolean
  }>(
    payload,
    sql`SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypass,
          has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
          EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owns
        FROM pg_roles r WHERE r.rolname = current_user`,
  )
  if (!row) return
  const powers = [
    row.superuser && 'is a superuser',
    row.bypass && 'bypasses Row-Level Security',
    row.can_create && 'can create tables',
    row.owns && 'owns the tables',
  ].filter(Boolean)
  if (powers.length === 0 || process.env.NODE_ENV !== 'production') return

  const message = `The site is connected to the database as "${row.name}", which ${powers.join(', ')}. It should connect as the app role (docs/SETUP.md, "Database roles").`
  if (process.env.DATABASE_URL_MIGRATE) throw new Error(`Refusing to start. ${message}`)
  payload.logger.warn(message)
}
