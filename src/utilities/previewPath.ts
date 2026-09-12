import type { CollectionSlug, PayloadRequest } from 'payload'

import type { Tenant } from '@/payload-types'

import { docPath } from './docHref'

type Args = {
  collection: 'pages' | 'posts' | 'ventures'
  slug?: string | null
  tenant?: number | string | Tenant | null
  req: PayloadRequest
}

/**
 * Builds the URL the admin panel opens for "Preview" and "Live preview".
 *
 * The page is addressed through its brand's internal route (/tenant-sites/<domain>/…),
 * so previews work for every brand from the one admin panel, whatever domain it's served on.
 */
export const generatePreviewPath = async ({ collection, slug, tenant, req }: Args) => {
  if (!slug) return null

  let domain: string | undefined
  if (tenant && typeof tenant === 'object') {
    domain = tenant.domains?.[0]?.domain
  } else if (tenant) {
    const doc = await req.payload
      .findByID({ collection: 'tenants' as CollectionSlug, id: tenant, depth: 0, req })
      .catch(() => null)
    domain = (doc as Tenant | null)?.domains?.[0]?.domain
  }

  const path = docPath(collection, slug)
  const internalPath = domain ? `/tenant-sites/${domain}${path === '/' ? '' : path}` : path

  const params = new URLSearchParams({
    path: internalPath,
    previewSecret: process.env.PREVIEW_SECRET || '',
  })

  return `/next/preview?${params.toString()}`
}
