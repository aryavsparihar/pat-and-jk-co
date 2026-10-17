import path from 'node:path'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'

import config from '@/payload.config'

/**
 * Payload connected to the database as the running site connects in production: a login role in
 * `pjk_app_access` (docs/SETUP.md, "Database roles"), with Row-Level Security applied, the
 * security log append-only, and no right to change the schema. The rest of the tests connect as
 * the database's owner, which none of that applies to, so something can pass there and still fail
 * on the live site. Tests that must hold for the live site use this instance.
 *
 * CI sets APP_DATABASE_URL (the role is made in the step that runs `pnpm check:database`). On a
 * laptop, point it at a database built by migrations, not by development push, which leaves the
 * grants and policies out.
 */
export const appRoleUrl = () => process.env.APP_DATABASE_URL || ''

export const appRolePayload = async (): Promise<Payload> => {
  const url = appRoleUrl()
  if (!url) throw new Error('APP_DATABASE_URL is not set')
  const base = await config
  return getPayload({
    key: 'app-role',
    config: {
      ...base,
      // The same schema, through the app role, and never pushed: that role cannot change it
      db: postgresAdapter({
        pool: { connectionString: url },
        push: false,
        migrationDir: path.resolve(process.cwd(), 'src/migrations'),
      }),
    } as never,
  })
}
