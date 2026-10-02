import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fills in what the previous migration made room for: PJK's registered office, and the closing
 * "Data controller" section on the privacy policy (and the office on the collaborate page).
 * Content normally belongs in the admin panel, but the site was live before these fields existed
 * and a deploy is the one place this code reaches the production database.
 *
 * It only ever fills a field that is empty, so nothing anyone writes in the admin is disturbed,
 * and it runs once like any other migration. Every step is optional: a failure is logged and
 * swallowed, because a missing address is not a reason to fail a deployment.
 *
 * Pages are filled with SQL rather than through Payload, deliberately: updating a page through
 * the API saves a new version, and would publish any unpublished draft sitting on it.
 *
 * Payload runs each migration inside a transaction, and in Postgres one failed statement poisons
 * the whole transaction, so catching the error would not be enough to keep the deploy alive. Each
 * page's statements therefore run under a savepoint, and a failure rolls back only that page.
 */

const TENANT = 'pjk'

type Db = MigrateUpArgs['db']

/** Runs statements so that if one fails, only they are undone and the migration carries on. */
const underSavepoint = async (
  db: Db,
  name: string,
  statements: ReturnType<typeof sql>[],
): Promise<number> => {
  await db.execute(sql.raw(`SAVEPOINT ${name}`))
  try {
    let changed = 0
    for (const statement of statements) {
      const result = (await db.execute(statement)) as { rowCount?: number | null }
      changed += result.rowCount ?? 0
    }
    await db.execute(sql.raw(`RELEASE SAVEPOINT ${name}`))
    return changed
  } catch (error) {
    await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${name}`))
    throw error
  }
}

const OFFICE = {
  line1: 'Ward No. 7',
  line2: 'ITI Road',
  landmark: 'Opposite Brahman Sabha',
  city: 'Kathua',
  state: 'Jammu and Kashmir',
  postalCode: '184101',
  country: 'India',
} as const

const PAGES: { slug: string; label: string | null; note: string | null }[] = [
  {
    slug: 'privacy',
    label: 'Data controller',
    note: 'PAT and J.K. Co. is responsible for the personal data collected through this website. Questions about it can be sent to the address below, or by email.',
  },
  { slug: 'collaborate', label: null, note: null },
]

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  try {
    const tenants = await payload.find({
      collection: 'tenants',
      where: { slug: { equals: TENANT } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const tenant = tenants.docs[0]
    if (!tenant) {
      payload.logger.info(`No “${TENANT}” brand on this database — no office to fill in.`)
      return
    }

    // Site settings: each address field only where it is empty
    try {
      const found = await payload.find({
        collection: 'site-settings',
        where: { tenant: { equals: tenant.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const settings = found.docs[0]
      if (settings) {
        const office: Record<string, string> = {}
        for (const [key, value] of Object.entries(OFFICE)) {
          const current = (settings.office as Record<string, string | null | undefined> | null)?.[
            key
          ]
          if (!current?.trim()) office[key] = value
        }
        if (Object.keys(office).length > 0) {
          await payload.update({
            collection: 'site-settings',
            id: settings.id,
            data: { office: { ...settings.office, ...office } },
            overrideAccess: true,
            context: { disableRevalidate: true },
          })
          payload.logger.info(`Filled in the registered office: ${Object.keys(office).join(', ')}.`)
        } else {
          payload.logger.info('The registered office is already filled in — left alone.')
        }
      }
    } catch (error) {
      payload.logger.warn(
        `Could not fill in the registered office; set it in Site settings. ${String(error)}`,
      )
    }

    // Pages: switch the closing office section on where nobody has decided either way
    for (const page of PAGES) {
      try {
        const changed = await underSavepoint(db, `office_${page.slug}`, [
          sql`
          UPDATE pages SET
            office_address_show = true,
            office_address_label = COALESCE(office_address_label, ${page.label}),
            office_address_note = COALESCE(office_address_note, ${page.note})
          WHERE tenant_id = ${tenant.id} AND slug = ${page.slug} AND office_address_show IS NULL
        `,
          sql`
          UPDATE _pages_v SET
            version_office_address_show = true,
            version_office_address_label = COALESCE(version_office_address_label, ${page.label}),
            version_office_address_note = COALESCE(version_office_address_note, ${page.note})
          WHERE version_office_address_show IS NULL
            AND parent_id IN (SELECT id FROM pages WHERE tenant_id = ${tenant.id} AND slug = ${page.slug})
        `,
        ])
        payload.logger.info(
          changed > 0
            ? `The ${page.slug} page now ends with the registered office.`
            : `The ${page.slug} page was already decided (or does not exist) — left alone.`,
        )
      } catch (error) {
        payload.logger.warn(
          `Could not update the ${page.slug} page; tick it in the admin. ${String(error)}`,
        )
      }
    }
  } catch (error) {
    payload.logger.warn(
      `Could not fill in the office address; set it in the admin. ${String(error)}`,
    )
  }
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Content, not schema. Rolling the database back should not delete what an editor has since
  // written, so this deliberately does nothing.
  payload.logger.info('Nothing to undo: this migration only added content.')
}
