import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Gives Phulhaar Gallery by PJK its own look on the ventures index and its venture page, by
 * setting its new Theme to "phulhaar". Only where the theme is still empty, so a choice already
 * made in the admin is never overwritten.
 *
 * Written with SQL rather than through Payload, deliberately: saving a venture through the API
 * makes a new version, and would publish any unpublished draft sitting on it. The published row
 * and its latest version (what the admin opens) are both set, so the next publish keeps it.
 *
 * A failure is logged and rolled back to a savepoint: a theme is not a reason to fail a deploy.
 */

const TENANT = 'pjk'
const SLUGS = ['phulhaar-gallery', 'phulhaar']

type Db = MigrateUpArgs['db']

/** Sets the theme on the brand's Phulhaar venture where it is empty; returns the ventures changed */
export const fillPhulhaarTheme = async (db: Db, tenantSlug: string): Promise<number[]> => {
  const venture = (await db.execute(sql`
    UPDATE ventures SET theme = 'phulhaar'
    WHERE theme IS NULL
      AND slug IN (${sql.join(
        SLUGS.map((s) => sql`${s}`),
        sql`, `,
      )})
      AND tenant_id = (SELECT id FROM tenants WHERE slug = ${tenantSlug} LIMIT 1)
    RETURNING id
  `)) as unknown as { rows: { id: number }[] }
  const ids = venture.rows.map((r) => r.id)
  if (ids.length > 0) {
    await db.execute(sql`
      UPDATE _ventures_v SET version_theme = 'phulhaar'
      WHERE version_theme IS NULL AND latest = true
        AND parent_id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})
    `)
  }
  return ids
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw('SAVEPOINT phulhaar_venture_theme'))
  try {
    const ids = await fillPhulhaarTheme(db, TENANT)
    await db.execute(sql.raw('RELEASE SAVEPOINT phulhaar_venture_theme'))
    payload.logger.info(
      ids.length > 0
        ? 'Phulhaar Gallery by PJK now has the Phulhaar theme.'
        : 'Phulhaar’s theme was already chosen (or the venture does not exist): left alone.',
    )
  } catch (error) {
    await db.execute(sql.raw('ROLLBACK TO SAVEPOINT phulhaar_venture_theme'))
    payload.logger.warn(
      `Could not set Phulhaar’s theme; choose it in the admin (Ventures → Theme). ${String(error)}`,
    )
  }
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Content, not schema: rolling back should not undo a choice an editor may since have made
  payload.logger.info('Nothing to undo: this migration only filled an empty setting.')
}
