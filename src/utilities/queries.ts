import 'server-only'

import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

/**
 * All frontend reads go through here and are always scoped to one brand (tenant).
 * `draft` is true only inside the admin's preview, where unpublished changes are shown.
 */

const payloadInstance = () => getPayload({ config: configPromise })

const byTenant = (tenantId: number, extra: Where[] = []): Where => ({
  and: [{ tenant: { equals: tenantId } }, ...extra],
})

export const getPageBySlug = cache(async (tenantId: number, slug: string, draft: boolean) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'pages',
    draft,
    depth: 2,
    limit: 1,
    pagination: false,
    overrideAccess: draft,
    where: byTenant(tenantId, [{ slug: { equals: slug } }]),
  })
  return result.docs[0] ?? null
})

export const getPostBySlug = cache(async (tenantId: number, slug: string, draft: boolean) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'posts',
    draft,
    depth: 2,
    limit: 1,
    pagination: false,
    overrideAccess: draft,
    where: byTenant(tenantId, [{ slug: { equals: slug } }]),
  })
  return result.docs[0] ?? null
})

export const getVentureBySlug = cache(async (tenantId: number, slug: string, draft: boolean) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'ventures',
    draft,
    depth: 2,
    limit: 1,
    pagination: false,
    overrideAccess: draft,
    where: byTenant(tenantId, [{ slug: { equals: slug } }]),
  })
  return result.docs[0] ?? null
})

export const getVentures = cache(async (tenantId: number, draft = false) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'ventures',
    draft,
    depth: 1,
    limit: 50,
    pagination: false,
    overrideAccess: draft,
    sort: ['order', 'name'],
    where: byTenant(tenantId, draft ? [] : [{ _status: { equals: 'published' } }]),
  })
  return result.docs
})

export const getPeople = cache(async (tenantId: number) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'people',
    depth: 1,
    limit: 50,
    pagination: false,
    overrideAccess: false,
    sort: ['order', 'name'],
    where: byTenant(tenantId),
  })
  return result.docs
})

export const getOpenings = cache(async (tenantId: number) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'openings',
    depth: 0,
    limit: 50,
    pagination: false,
    overrideAccess: false,
    sort: ['order', '-createdAt'],
    where: byTenant(tenantId),
  })
  return result.docs
})

export const getPosts = async (
  tenantId: number,
  { limit = 3, categoryIds = [] }: { limit?: number; categoryIds?: number[] } = {},
) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'posts',
    depth: 1,
    limit,
    overrideAccess: false,
    sort: '-publishedAt',
    where: byTenant(tenantId, categoryIds.length > 0 ? [{ categories: { in: categoryIds } }] : []),
  })
  return result.docs
}

export const getRedirectFor = cache(async (tenantId: number, from: string) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection: 'redirects',
    depth: 1,
    limit: 1,
    pagination: false,
    where: byTenant(tenantId, [{ from: { equals: from } }]),
  })
  return result.docs[0] ?? null
})

/** Slugs for static generation at build time. */
export const getAllSlugs = async (collection: 'pages' | 'posts' | 'ventures', tenantId: number) => {
  const payload = await payloadInstance()
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 1000,
    pagination: false,
    overrideAccess: false,
    select: { slug: true },
    // "Coming soon" ventures have no page of their own
    where: byTenant(
      tenantId,
      collection === 'ventures' ? [{ stage: { not_equals: 'coming-soon' } }] : [],
    ),
  })
  return result.docs.map((d) => d.slug).filter(Boolean) as string[]
}
