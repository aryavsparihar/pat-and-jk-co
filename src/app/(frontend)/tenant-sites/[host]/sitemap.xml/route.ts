import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { docPath } from '@/utilities/docHref'
import { getTenantContext } from '@/utilities/tenant'

// Rendered per request (it depends on the hostname) and cached by the CDN for an hour
export const dynamic = 'force-dynamic'

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Per-brand sitemap: every published page, journal post and venture. */
export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params
  const ctx = await getTenantContext(host)
  if (!ctx) return new Response('Not found', { status: 404 })

  const payload = await getPayload({ config: configPromise })
  const tenantWhere = { tenant: { equals: ctx.tenant.id } }

  const [pages, posts, ventures] = await Promise.all([
    payload.find({
      collection: 'pages',
      depth: 0,
      limit: 1000,
      pagination: false,
      overrideAccess: false,
      select: { slug: true, updatedAt: true },
      where: tenantWhere,
    }),
    payload.find({
      collection: 'posts',
      depth: 0,
      limit: 1000,
      pagination: false,
      overrideAccess: false,
      select: { slug: true, updatedAt: true },
      where: tenantWhere,
    }),
    payload.find({
      collection: 'ventures',
      depth: 0,
      limit: 1000,
      pagination: false,
      overrideAccess: false,
      select: { slug: true, updatedAt: true, stage: true },
      where: { and: [tenantWhere, { stage: { not_equals: 'coming-soon' } }] },
    }),
  ])

  const entries = [
    ...pages.docs.map((d) => ({ loc: docPath('pages', d.slug), lastmod: d.updatedAt })),
    ...posts.docs.map((d) => ({ loc: docPath('posts', d.slug), lastmod: d.updatedAt })),
    ...ventures.docs.map((d) => ({ loc: docPath('ventures', d.slug), lastmod: d.updatedAt })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${escape(`${ctx.siteUrl}${e.loc === '/' ? '' : e.loc}`)}</loc>${
        e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ''
      }</url>`,
  )
  .join('\n')}
</urlset>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
