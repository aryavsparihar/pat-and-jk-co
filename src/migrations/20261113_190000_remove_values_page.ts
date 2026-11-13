import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The Our values page comes off the site (13 November 2026). Nothing is deleted:
 *
 * - "Our values" leaves the header and the footer of the PJK site;
 * - the page is unpublished, so /values no longer opens. It stays in the admin as a draft, with
 *   its history, and can be published again from there;
 * - the journal post that linked to it keeps its words, without the link.
 *
 * A database without the PJK brand or the page is left alone.
 */
const TENANT = 'pjk'
const SLUG = 'values'
const VALUES_URL = /^\/values\/?(?:[?#].*)?$/

type Link = {
  type?: string | null
  url?: string | null
  reference?: { value?: unknown } | null
}
type NavItem = { link?: Link | null }

const idOf = (value: unknown) =>
  value && typeof value === 'object' ? (value as { id?: unknown }).id : value

const pointsAtValues = (item: NavItem, pageId: number | string) => {
  const link = item.link
  if (!link) return false
  if (link.type === 'reference') return idOf(link.reference?.value) === pageId
  return VALUES_URL.test(link.url ?? '')
}

type LexicalNode = {
  type?: string
  url?: string
  fields?: { linkType?: string; url?: string; doc?: { value?: unknown } | null }
  children?: LexicalNode[]
}

/** Replaces every link to the page with its own words; true if any was found */
const unlink = (node: LexicalNode, pageId: number | string): boolean => {
  if (!node.children) return false
  let changed = false
  const children: LexicalNode[] = []
  for (const child of node.children) {
    const isLink = child.type === 'link' || child.type === 'autolink'
    const target = child.fields
    const toValues =
      isLink &&
      (target?.linkType === 'internal'
        ? idOf(target.doc?.value) === pageId
        : VALUES_URL.test(target?.url ?? child.url ?? ''))
    if (toValues) {
      changed = true
      children.push(...(child.children ?? []))
    } else {
      if (unlink(child, pageId)) changed = true
      children.push(child)
    }
  }
  node.children = children
  return changed
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const tenant = (
    await payload.find({
      collection: 'tenants',
      where: { slug: { equals: TENANT } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  if (!tenant) return payload.logger.info('No PJK brand on this database: values page left alone.')
  const page = (
    await payload.find({
      collection: 'pages',
      where: { and: [{ slug: { equals: SLUG } }, { tenant: { equals: tenant.id } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  if (!page) return payload.logger.info('No values page on this database: left alone.')

  // The header and footer
  const settings = (
    await payload.find({
      collection: 'site-settings',
      where: { tenant: { equals: tenant.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  if (settings) {
    const headerNav = (settings.headerNav ?? []).filter((i) => !pointsAtValues(i, page.id))
    const footerNav = (settings.footerNav ?? []).filter((i) => !pointsAtValues(i, page.id))
    await payload.update({
      collection: 'site-settings',
      id: settings.id,
      data: { headerNav, footerNav },
      overrideAccess: true,
      context: { disableRevalidate: true },
      req,
    })
    // Payload rewrites the links but leaves the old last ones' page references behind, past the
    // end of each list; they are never read, but are cleared so the record matches what is shown
    for (const [list, table] of [
      ['headerNav', 'site_settings_header_nav'],
      ['footerNav', 'site_settings_footer_nav'],
    ] as const) {
      await db.execute(
        sql.raw(`DELETE FROM site_settings_rels r
          WHERE r.parent_id = ${Number(settings.id)}
            AND r.path ~ '^${list}\\.[0-9]+\\.'
            AND split_part(r.path, '.', 2)::int >=
              (SELECT count(*) FROM ${table} n WHERE n._parent_id = r.parent_id)`),
      )
    }
  }

  // Posts that link to it keep their words
  const posts = await payload.find({
    collection: 'posts',
    where: { tenant: { equals: tenant.id } },
    limit: 0,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const post of posts.docs) {
    const content = post.content as { root?: LexicalNode } | null | undefined
    if (!content?.root || !unlink(content.root, page.id)) continue
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { content: content as never },
      draft: false,
      overrideAccess: true,
      context: { disableRevalidate: true },
      req,
    })
    payload.logger.info(`Removed the link to the values page from the post "${post.slug}".`)
  }

  // Unpublished, not deleted
  await payload.update({
    collection: 'pages',
    id: page.id,
    data: { _status: 'draft' },
    draft: false,
    overrideAccess: true,
    context: { disableRevalidate: true },
    req,
  })
  payload.logger.info('The values page is unpublished and gone from the header and footer.')
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  payload.logger.info(
    'Not reversed by code: publish the values page again in the admin and add it back to the header and footer.',
  )
}
