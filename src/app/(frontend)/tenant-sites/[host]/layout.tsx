import type { Metadata } from 'next'
import type { CSSProperties } from 'react'

import configPromise from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import { HashLinks } from '@/components/HashLinks'
import { OrganizationJsonLd } from '@/components/JsonLd'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { getVentures } from '@/utilities/queries'
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

const HEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/

/** The brand's palette from Site settings, applied as CSS custom properties. */
const themeStyle = (colours?: Record<string, string | null | undefined> | null): CSSProperties => {
  const style: Record<string, string> = {}
  for (const key of ['primary', 'background', 'surface', 'foreground'] as const) {
    const value = colours?.[key]
    if (value && HEX.test(value)) style[`--${key}`] = value
  }
  return style as CSSProperties
}

export async function generateMetadata({ params }: Omit<Args, 'children'>): Promise<Metadata> {
  const { host } = await params
  const ctx = await getTenantContext(host)
  const siteName = ctx?.settings?.siteName ?? 'PAT and J.K. Co.'

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

  const ventures = await getVentures(ctx.tenant.id)

  return (
    <div
      className="brand-theme flex min-h-screen flex-col bg-background text-foreground"
      data-brand={ctx.tenant.slug}
      style={themeStyle(ctx.settings?.colours)}
    >
      <SiteHeader settings={ctx.settings} />
      <main className="flex-1" id="main">
        {children}
      </main>
      <SiteFooter settings={ctx.settings} ventures={ventures} />
      <OrganizationJsonLd ctx={ctx} />
      <HashLinks />
    </div>
  )
}
