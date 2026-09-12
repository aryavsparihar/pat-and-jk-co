import type { SiteSetting } from '@/payload-types'

import { resolveLinkHref } from '@/components/Link'
import React from 'react'

import { BrandLogo } from '../BrandLogo'
import { HeaderClient, type NavItem } from './HeaderClient'

/** Resolves CMS navigation into plain hrefs on the server, then hands off to the interactive header. */
export const SiteHeader: React.FC<{ settings: SiteSetting | null }> = ({ settings }) => {
  const nav: NavItem[] = (settings?.headerNav ?? [])
    .map(({ link }) => ({
      href: resolveLinkHref(link) ?? '',
      label: link.label ?? '',
      newTab: Boolean(link.newTab),
    }))
    .filter((item) => item.href && item.label)

  const ctaHref = settings?.enableHeaderCta ? resolveLinkHref(settings.headerCta ?? {}) : null
  const cta: NavItem | null =
    ctaHref && settings?.headerCta?.label
      ? {
          href: ctaHref,
          label: settings.headerCta.label,
          newTab: Boolean(settings.headerCta.newTab),
        }
      : null

  return (
    <HeaderClient
      contactEmail={settings?.email ?? null}
      cta={cta}
      logo={
        // A compact mark if one is uploaded; otherwise the name in small capitals
        settings?.wordmark ? (
          <BrandLogo className="h-7 w-auto md:h-8" priority settings={settings} variant="compact" />
        ) : (
          <span className="smallcaps text-[1.3rem] leading-none">{settings?.siteName}</span>
        )
      }
      nav={nav}
      siteName={settings?.siteName ?? ''}
    />
  )
}
