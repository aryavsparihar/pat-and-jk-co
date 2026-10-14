import type { Payload } from 'payload'

/**
 * The records the live site cannot do without, checked read-only: the brand and its settings,
 * the pages the navigation links to, a venture to show, the two enquiry forms and somebody who
 * can sign in to the admin. Run as `pnpm check:content` against any database, or by staff as
 * /api/health?deep=1. Reports what is missing; changes nothing.
 */

/** Pages the header, footer and links across the site point at */
export const REQUIRED_PAGES = [
  'home',
  'about',
  'values',
  'ventures',
  'leadership',
  'journal',
  'contact',
  'privacy',
  'collaborate',
] as const

/** Forms the contact and collaborate pages embed */
export const REQUIRED_FORMS = ['Contact', 'Collaborate'] as const

export type ContentCheck = { ok: boolean; checked: number; missing: string[] }

export const checkContent = async (payload: Payload): Promise<ContentCheck> => {
  const missing: string[] = []
  let checked = 0
  const need = (present: unknown, what: string) => {
    checked++
    if (!present) missing.push(what)
  }
  const slug = process.env.DEFAULT_TENANT_SLUG || 'pjk'

  const tenant = (
    await payload.find({
      collection: 'tenants',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  need(tenant, `the brand "${slug}" (Brands)`)
  need(tenant?.domains?.length, `a domain on the brand "${slug}" (Brands → Domains)`)
  if (!tenant) return { ok: false, checked, missing }

  const settings = (
    await payload.find({
      collection: 'site-settings',
      where: { tenant: { equals: tenant.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  need(settings, 'Site settings for the brand')
  need(settings?.siteName, 'Site settings → site name')
  need(settings?.headerNav?.length, 'Site settings → header navigation')
  need(settings?.footerNav?.length, 'Site settings → footer navigation')
  need(settings?.email, 'Site settings → Contact & social → email')

  const pages = await payload.find({
    collection: 'pages',
    where: { and: [{ tenant: { equals: tenant.id } }, { _status: { equals: 'published' } }] },
    limit: 200,
    depth: 0,
    overrideAccess: true,
    select: { slug: true },
  })
  const published = new Set(pages.docs.map((p) => p.slug))
  for (const page of REQUIRED_PAGES) need(published.has(page), `the published page "${page}"`)

  const ventures = await payload.count({
    collection: 'ventures',
    where: { and: [{ tenant: { equals: tenant.id } }, { _status: { equals: 'published' } }] },
    overrideAccess: true,
  })
  need(ventures.totalDocs > 0, 'at least one published venture')

  const forms = await payload.find({
    collection: 'forms',
    where: { tenant: { equals: tenant.id } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
    select: { title: true },
  })
  const titles = new Set(forms.docs.map((f) => f.title))
  for (const form of REQUIRED_FORMS)
    need(titles.has(form), `the form "${form}" (Enquiries → Forms)`)

  const admins = await payload.count({
    collection: 'users',
    where: { and: [{ roles: { contains: 'super-admin' } }, { status: { equals: 'active' } }] },
    overrideAccess: true,
  })
  need(admins.totalDocs > 0, 'an active super admin')

  return { ok: missing.length === 0, checked, missing }
}
