import 'server-only'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { SiteSetting, Tenant } from '@/payload-types'

import { getServerSideURL } from './getURL'
import { normalizeHost } from './host'

export type TenantContext = {
  tenant: Tenant
  settings: SiteSetting | null
  /** Absolute origin used for canonical URLs, sitemaps and social previews */
  siteUrl: string
}

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || 'pjk'

/**
 * Finds the brand for a hostname. Unknown hosts (localhost, Vercel preview URLs)
 * fall back to the default brand, so the site always renders something sensible.
 */
export const getTenantByHost = cache(async (rawHost: string): Promise<Tenant | null> => {
  const host = normalizeHost(decodeURIComponent(rawHost))
  const payload = await getPayload({ config: configPromise })

  const byDomain = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 1,
    pagination: false,
    where: { 'domains.domain': { equals: host } },
  })
  if (byDomain.docs[0]) return byDomain.docs[0]

  const fallback = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 1,
    pagination: false,
    sort: 'createdAt',
    where: { slug: { equals: DEFAULT_TENANT_SLUG } },
  })
  if (fallback.docs[0]) return fallback.docs[0]

  const first = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 1,
    pagination: false,
    sort: 'createdAt',
  })
  return first.docs[0] ?? null
})

export const getSiteSettings = cache(async (tenantId: number): Promise<SiteSetting | null> => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'site-settings',
    depth: 1,
    limit: 1,
    pagination: false,
    where: { tenant: { equals: tenantId } },
  })
  return result.docs[0] ?? null
})

export const primaryDomain = (tenant: Tenant): string | undefined => tenant.domains?.[0]?.domain

export const getSiteUrl = (tenant: Tenant): string => {
  const domain = primaryDomain(tenant)
  if (process.env.NODE_ENV === 'production' && domain && !domain.endsWith('.localhost')) {
    return `https://${domain}`
  }
  return getServerSideURL()
}

/** Everything a brand page needs to render: the brand, its settings and its public URL. */
export const getTenantContext = cache(async (host: string): Promise<TenantContext | null> => {
  const tenant = await getTenantByHost(host)
  if (!tenant) return null
  const settings = await getSiteSettings(tenant.id)
  return { tenant, settings, siteUrl: getSiteUrl(tenant) }
})
