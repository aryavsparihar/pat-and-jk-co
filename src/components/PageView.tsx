import type { Metadata } from 'next'

import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import React from 'react'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { docPath } from '@/utilities/docHref'
import { generateMeta } from '@/utilities/meta'
import { getPageBySlug } from '@/utilities/queries'
import { getTenantContext } from '@/utilities/tenant'

/** Renders a CMS page (built from blocks) for the brand served on `host`. */
export async function PageView({ host, slug }: { host: string; slug: string }) {
  const { isEnabled: draft } = await draftMode()
  const ctx = await getTenantContext(host)
  if (!ctx) notFound()

  const path = docPath('pages', slug)
  const page = await getPageBySlug(ctx.tenant.id, slug, draft)

  if (!page) return <PayloadRedirects tenantId={ctx.tenant.id} url={path} />

  return (
    <article>
      {/* Redirects configured for existing pages take precedence */}
      <PayloadRedirects disableNotFound tenantId={ctx.tenant.id} url={path} />
      {draft && <LivePreviewListener />}
      <RenderBlocks
        blocks={page.layout}
        ctx={{ tenantId: ctx.tenant.id, settings: ctx.settings, draft }}
      />
    </article>
  )
}

export async function pageMetadata(host: string, slug: string): Promise<Metadata> {
  const { isEnabled: draft } = await draftMode()
  const ctx = await getTenantContext(host)
  if (!ctx) return {}
  const page = await getPageBySlug(ctx.tenant.id, slug, draft)
  return generateMeta({ ctx, doc: page, path: docPath('pages', slug) })
}
