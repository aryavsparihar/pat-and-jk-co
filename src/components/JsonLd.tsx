import type { Media } from '@/payload-types'
import type { TenantContext } from '@/utilities/tenant'

import React from 'react'

/** Organization structured data, so search engines understand who the brand is. */
export const OrganizationJsonLd: React.FC<{ ctx: TenantContext }> = ({ ctx }) => {
  const { settings, siteUrl } = ctx
  const logo =
    settings?.logo && typeof settings.logo === 'object' ? (settings.logo as Media).url : null

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings?.siteName,
    url: siteUrl,
    description: settings?.description || undefined,
    logo: logo ? (logo.startsWith('http') ? logo : `${siteUrl}${logo}`) : `${siteUrl}/icon-512.png`,
    email: settings?.email || undefined,
    telephone: settings?.phone || undefined,
    sameAs: settings?.socials?.map((s) => s.url) ?? undefined,
  }

  return (
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
      type="application/ld+json"
    />
  )
}
