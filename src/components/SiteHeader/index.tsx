import type { SiteSetting } from '@/payload-types'

import React from 'react'

import { HeaderClient, type NavItem } from './HeaderClient'

/**
 * The six links of the founder's brief (25 November 2026, section 2), in his order. They are fixed
 * here rather than taken from the admin: the pages they open are part of the design, and Work with
 * us stays at /collaborate, which the agreements cite.
 */
export const HEADER_NAV: NavItem[] = [
  { href: '/about', label: 'About' },
  { href: '/ventures', label: 'Ventures' },
  { href: '/leadership', label: 'Leadership' },
  { href: '/journal', label: 'Journal' },
  { href: '/collaborate', label: 'Work with us' },
  { href: '/contact', label: 'Contact' },
]

export const SiteHeader: React.FC<{ settings: SiteSetting | null }> = ({ settings }) => (
  <HeaderClient
    contactEmail={settings?.email ?? null}
    nav={HEADER_NAV}
    siteName={settings?.siteName || 'PAT & J.K. Co.'}
  />
)
