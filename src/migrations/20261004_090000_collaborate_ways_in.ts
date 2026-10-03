import { randomBytes } from 'node:crypto'

import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { howItWorksBlock, pathsBlock } from '../seed/collaborate'

/**
 * Gives the live collaborate page its two ways in: the "Two ways to begin" block, linking to
 * /collaborate/artists and /collaborate/partners, and "How it works". The site was live before
 * the onboarding, so a fresh install's seed never reached it, and a deploy is the one place this
 * code reaches the production database.
 *
 * Only what is missing is added. A page that already has a "Two ways to begin" block, or a
 * principles block headed "How it works", keeps it as it is; nothing already on the page is
 * changed except its position, which moves down to make room.
 *
 * Pages are changed with SQL rather than through Payload, deliberately: saving a page through the
 * API makes a new version, and would publish any unpublished draft sitting on it. Payload keeps
 * the published page in `pages` and a draft only in `_pages_v`, so the blocks go into both the
 * published page (what visitors see) and its latest version (what the admin opens, so the next
 * publish keeps them). Older versions are history and are left alone.
 *
 * The open calls on the page whose button still leads to the contact form are pointed at the
 * matching application: artist calls at /collaborate/artists, collaborator and partner calls at
 * /collaborate/partners. A call with any other link, and a role, is left alone.
 *
 * Like the office address before it, every step is optional: a failure is logged and rolled back
 * to a savepoint, because a missing block is not a reason to fail a deployment.
 */

const TENANT = 'pjk'
const SLUG = 'collaborate'
const OLD_LINKS = ['/collaborate#form', '/contact']

type Db = MigrateUpArgs['db']
type Row = Record<string, unknown>

const rows = async <T extends Row>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> =>
  ((await db.execute(query)) as unknown as { rows: T[] }).rows

/** Runs a step so that if it fails, only it is undone and the migration carries on. */
const underSavepoint = async <T>(db: Db, name: string, step: () => Promise<T>): Promise<T> => {
  await db.execute(sql.raw(`SAVEPOINT ${name}`))
  try {
    const result = await step()
    await db.execute(sql.raw(`RELEASE SAVEPOINT ${name}`))
    return result
  } catch (error) {
    await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${name}`))
    throw error
  }
}

/** Block ids as Payload makes them */
const blockId = () => randomBytes(12).toString('hex')

/**
 * One copy of the page's layout: the published page (`pages_blocks_*`, parent the page) or a
 * version of it (`_pages_v_blocks_*`, parent the version, with the block's id kept in `_uuid`).
 */
type Layout = { prefix: 'pages_blocks_' | '_pages_v_blocks_'; parent: number }

const isVersion = (layout: Layout) => layout.prefix === '_pages_v_blocks_'
/** Where the blocks hang: the page's layout field, or inside a version's copy of the page */
const pathOf = (layout: Layout) => (isVersion(layout) ? 'version.layout' : 'layout')
const table = (layout: Layout, name: string) => sql.raw(`"${layout.prefix}${name}"`)

/** Every top-level block table: the ones with a _path column (arrays inside blocks have none) */
const blockTables = async (db: Db, layout: Layout): Promise<string[]> =>
  (
    await rows<{ table_name: string }>(
      db,
      sql`SELECT table_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND column_name = '_path'`,
    )
  )
    .map((r) => r.table_name)
    .filter((name) => name.startsWith(layout.prefix))

/** The layout's blocks in order, by the table each is kept in */
const blocksOf = async (db: Db, layout: Layout, tables: string[]) => {
  const found: { type: string; order: number }[] = []
  for (const name of tables) {
    const result = await rows<{ _order: number }>(
      db,
      sql`SELECT _order FROM ${sql.raw(`"${name}"`)}
          WHERE _parent_id = ${layout.parent} AND _path = ${pathOf(layout)}`,
    )
    for (const r of result) found.push({ type: name.slice(layout.prefix.length), order: r._order })
  }
  return found.sort((a, b) => a.order - b.order)
}

/** Moves every block at or after `order` down by one, to make room at `order` */
const makeRoom = async (db: Db, layout: Layout, tables: string[], order: number) => {
  for (const name of tables) {
    await db.execute(
      sql`UPDATE ${sql.raw(`"${name}"`)} SET _order = _order + 1
          WHERE _parent_id = ${layout.parent} AND _path = ${pathOf(layout)} AND _order >= ${order}`,
    )
  }
}

const insertPaths = async (db: Db, layout: Layout, order: number, id: string) => {
  const b = pathsBlock
  const values = sql`${order}, ${layout.parent}, ${pathOf(layout)}, ${b.eyebrow}, ${b.heading},
    ${b.artists.heading}, ${b.artists.text}, ${b.artists.linkLabel},
    ${b.partners.heading}, ${b.partners.text}, ${b.partners.linkLabel}, ${b.signInText}`
  const columns = sql`_order, _parent_id, _path, eyebrow, heading,
    artists_heading, artists_text, artists_link_label,
    partners_heading, partners_text, partners_link_label, sign_in_text`
  await db.execute(
    isVersion(layout)
      ? sql`INSERT INTO ${table(layout, 'paths')} (${columns}, _uuid) VALUES (${values}, ${id})`
      : sql`INSERT INTO ${table(layout, 'paths')} (${columns}, id) VALUES (${values}, ${id})`,
  )
}

const insertHowItWorks = async (
  db: Db,
  layout: Layout,
  order: number,
  id: string,
  itemIds: string[],
) => {
  const b = howItWorksBlock
  if (isVersion(layout)) {
    const [block] = await rows<{ id: number }>(
      db,
      sql`INSERT INTO ${table(layout, 'principles')}
            (_order, _parent_id, _path, eyebrow, heading, numbering, _uuid)
          VALUES (${order}, ${layout.parent}, ${pathOf(layout)}, ${b.eyebrow}, ${b.heading}, ${b.numbering}, ${id})
          RETURNING id`,
    )
    for (const [i, item] of b.items.entries()) {
      await db.execute(
        sql`INSERT INTO ${table(layout, 'principles_items')} (_order, _parent_id, title, text, _uuid)
            VALUES (${i + 1}, ${block!.id}, ${item.title}, ${item.text}, ${itemIds[i]})`,
      )
    }
    return
  }
  await db.execute(
    sql`INSERT INTO ${table(layout, 'principles')}
          (_order, _parent_id, _path, id, eyebrow, heading, numbering)
        VALUES (${order}, ${layout.parent}, ${pathOf(layout)}, ${id}, ${b.eyebrow}, ${b.heading}, ${b.numbering})`,
  )
  for (const [i, item] of b.items.entries()) {
    await db.execute(
      sql`INSERT INTO ${table(layout, 'principles_items')} (_order, _parent_id, id, title, text)
          VALUES (${i + 1}, ${id}, ${itemIds[i]}, ${item.title}, ${item.text})`,
    )
  }
}

/** The same block ids in the published page and its versions, as Payload itself would have */
type Ids = { paths: string; howItWorks: string; items: string[] }

/** Adds whichever of the two blocks this copy of the layout lacks; returns what it added */
const addToLayout = async (db: Db, layout: Layout, ids: Ids): Promise<string[]> => {
  const tables = await blockTables(db, layout)
  const added: string[] = []

  let blocks = await blocksOf(db, layout, tables)
  if (!blocks.some((b) => b.type === 'paths')) {
    // Straight after the page's introduction, or first if it has none
    const first = blocks[0]
    const at = first ? (first.type === 'page_intro' ? first.order + 1 : first.order) : 1
    await makeRoom(db, layout, tables, at)
    await insertPaths(db, layout, at, ids.paths)
    added.push('Two ways to begin')
  }

  const howItWorks = await rows(
    db,
    sql`SELECT 1 FROM ${table(layout, 'principles')}
        WHERE _parent_id = ${layout.parent} AND _path = ${pathOf(layout)}
          AND lower(trim(eyebrow)) = lower(${howItWorksBlock.eyebrow})`,
  )
  if (howItWorks.length === 0) {
    // Just before the open calls; failing that, after the ways in; failing that, at the end
    blocks = await blocksOf(db, layout, tables)
    const openings = blocks.find((b) => b.type === 'openings')
    const paths = blocks.find((b) => b.type === 'paths')
    const last = blocks[blocks.length - 1]
    const at = openings ? openings.order : paths ? paths.order + 1 : (last?.order ?? 0) + 1
    await makeRoom(db, layout, tables, at)
    await insertHowItWorks(db, layout, at, ids.howItWorks, ids.items)
    added.push('How it works')
  }
  return added
}

/** The collaborate page of one brand: the published page and its latest version */
export const addWaysIn = async (db: Db, tenantId: number): Promise<string[]> => {
  const [page] = await rows<{ id: number }>(
    db,
    sql`SELECT id FROM pages WHERE tenant_id = ${tenantId} AND slug = ${SLUG} LIMIT 1`,
  )
  if (!page) return []
  const ids: Ids = {
    paths: blockId(),
    howItWorks: blockId(),
    items: howItWorksBlock.items.map(() => blockId()),
  }
  const added = await addToLayout(db, { prefix: 'pages_blocks_', parent: page.id }, ids)
  const latest = await rows<{ id: number }>(
    db,
    sql`SELECT id FROM _pages_v WHERE parent_id = ${page.id} AND latest = true`,
  )
  for (const version of latest) {
    await addToLayout(db, { prefix: '_pages_v_blocks_', parent: version.id }, ids)
  }
  return added
}

/** Open calls still sent to the contact form, pointed at the application they belong to */
export const pointOpeningsAtPaths = async (db: Db, tenantId: number): Promise<number> => {
  let changed = 0
  for (const [types, path] of [
    [['artist'], '/collaborate/artists'],
    [['collaborator', 'partner'], '/collaborate/partners'],
  ] as const) {
    const result = (await db.execute(
      sql`UPDATE openings SET apply_url = ${path}
          WHERE tenant_id = ${tenantId}
            AND type::text IN (${sql.join(
              types.map((t) => sql`${t}`),
              sql`, `,
            )})
            AND (apply_url IS NULL OR trim(apply_url) = '' OR apply_url IN (${sql.join(
              OLD_LINKS.map((l) => sql`${l}`),
              sql`, `,
            )}))`,
    )) as { rowCount?: number | null }
    changed += result.rowCount ?? 0
  }
  return changed
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  try {
    const [tenant] = await rows<{ id: number }>(
      db,
      sql`SELECT id FROM tenants WHERE slug = ${TENANT} LIMIT 1`,
    )
    if (!tenant) {
      payload.logger.info(`No “${TENANT}” brand on this database — no collaborate page to fill in.`)
      return
    }

    try {
      const added = await underSavepoint(db, 'collaborate_ways_in', () => addWaysIn(db, tenant.id))
      payload.logger.info(
        added.length > 0
          ? `The collaborate page now has: ${added.join(', ')}.`
          : 'The collaborate page already has its ways in (or does not exist) — left alone.',
      )
    } catch (error) {
      payload.logger.warn(
        `Could not add the ways in to the collaborate page; add them in the admin. ${String(error)}`,
      )
    }

    try {
      const changed = await underSavepoint(db, 'collaborate_openings', () =>
        pointOpeningsAtPaths(db, tenant.id),
      )
      payload.logger.info(`Open calls pointed at the applications: ${changed}.`)
    } catch (error) {
      payload.logger.warn(
        `Could not point the open calls at the applications; change them in the admin. ${String(error)}`,
      )
    }
  } catch (error) {
    payload.logger.warn(`Could not update the collaborate page. ${String(error)}`)
  }
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Content, not schema. Rolling the database back should not delete what an editor has since
  // arranged, so this deliberately does nothing.
  payload.logger.info('Nothing to undo: this migration only added content.')
}
