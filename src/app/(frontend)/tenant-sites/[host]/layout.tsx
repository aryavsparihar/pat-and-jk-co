import type { Metadata } from 'next'

import configPromise from '@payload-config'
import Link from '@/components/IntentLink'
import { getPayload } from 'payload'
import React from 'react'

import { HashLinks } from '@/components/HashLinks'
import { OrganizationJsonLd } from '@/components/JsonLd'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { getTenantContext, primaryDomain } from '@/utilities/tenant'

type Args = {
  children: React.ReactNode
  params: Promise<{ host: string }>
}

// A safety net only: every save in the admin already refreshes every page at once
// (src/hooks/revalidateFrontend.ts). Every six hours, not hourly: each refresh writes several
// cache entries per page, and hourly ones outnumbered the pages actually read. Six hours still
// takes an opening notice down within a few hours of its day ending (OpeningNotice.tsx)
export const revalidate = 21600

/** Pre-render every brand's primary domain at build time. */
export async function generateStaticParams() {
  try {
    const payload = await getPayload({ config: configPromise })
    const tenants = await payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 100,
      pagination: false,
    })
    return tenants.docs
      .map((t) => primaryDomain(t))
      .filter((d): d is string => Boolean(d))
      .map((host) => ({ host }))
  } catch {
    // No database at build time — pages will render on first request instead
    return []
  }
}

export async function generateMetadata({ params }: Omit<Args, 'children'>): Promise<Metadata> {
  const { host } = await params
  const ctx = await getTenantContext(host)
  const siteName = ctx?.settings?.siteName ?? 'PAT & J.K. Co.'

  return {
    metadataBase: ctx ? new URL(ctx.siteUrl) : undefined,
    title: {
      default: siteName,
      template: `%s — ${siteName}`,
    },
    description: ctx?.settings?.description ?? undefined,
    applicationName: siteName,
    robots: process.env.VERCEL_ENV === 'preview' ? { index: false, follow: false } : undefined,
  }
}

export default async function BrandLayout({ children, params }: Args) {
  const { host } = await params
  const ctx = await getTenantContext(host)

  if (!ctx) {
    return (
      <main className="container flex min-h-screen flex-col items-center justify-center text-center">
        <span aria-hidden className="ornament mb-8 text-primary" />
        <h1 className="display-lg">Almost ready.</h1>
        <p className="lede mt-6 max-w-lg">
          No brand has been set up yet. Run <code>pnpm seed</code> or create a brand in the admin
          panel.
        </p>
        <Link className="btn btn-solid mt-10" href="/admin">
          Open admin
        </Link>
      </main>
    )
  }

  return (
    <div
      className="brand-theme flex min-h-screen flex-col bg-background text-foreground"
      // Where the footer's Back to top goes
      id="top"
      // The palette is the founder's, fixed in globals.css; the old colour settings are not read
      data-brand={ctx.tenant.slug}
    >
      <SiteHeader settings={ctx.settings} />
      <main className="flex-1" id="main">
        {children}
      </main>
      <SiteFooter settings={ctx.settings} />
      <OrganizationJsonLd ctx={ctx} />
      <HashLinks />
    </div>
  )
}
