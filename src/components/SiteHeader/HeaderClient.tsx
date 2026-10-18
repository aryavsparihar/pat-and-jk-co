'use client'

import { cn } from '@/utilities/ui'
import Link from '@/components/IntentLink'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState, useSyncExternalStore } from 'react'

import { AccountControl } from './AccountControl'

export type NavItem = { href: string; label: string; newTab: boolean }

type Props = {
  contactEmail: string | null
  cta: NavItem | null
  logo: React.ReactNode
  nav: NavItem[]
  siteName: string
}

const isActive = (pathname: string | null, href: string) =>
  pathname !== null &&
  (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))

/** Strips the internal /tenant-sites/<host> prefix the server renders with. */
const publicPath = (pathname: string) => pathname.replace(/^\/tenant-sites\/[^/]+/, '') || '/'

const noopSubscribe = () => () => {}

export const HeaderClient: React.FC<Props> = ({ contactEmail, cta, logo, nav, siteName }) => {
  const livePathname = usePathname()
  // Read the path only once hydrated: the server renders through a rewrite, so using it during
  // the first render would cause a hydration mismatch (see Next.js docs on usePathname + Proxy).
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  const pathname = hydrated ? publicPath(livePathname || '/') : null
  const [open, setOpen] = useState(false)

  // Close the mobile menu whenever the route changes (state reset during render, per React docs)
  const [menuPath, setMenuPath] = useState(livePathname)
  if (menuPath !== livePathname) {
    setMenuPath(livePathname)
    setOpen(false)
  }

  // Lock page scroll while the mobile menu is open
  useEffect(() => {
    document.documentElement.style.overflow = open ? 'hidden' : ''
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const linkProps = (item: NavItem) => ({
    href: item.href,
    ...(item.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
    'aria-current': isActive(pathname, item.href) ? ('page' as const) : undefined,
  })

  const items = [...nav, ...(cta ? [cta] : [])]

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-background focus:px-4 focus:py-2"
          href="#main"
        >
          Skip to content
        </a>

        <div className="container flex h-16 items-center justify-between gap-4 sm:gap-8 md:h-[4.5rem]">
          <Link aria-label={`${siteName}, home`} className="shrink-0 text-primary" href="/">
            {logo}
          </Link>

          <nav aria-label="Main" className="hidden xl:block">
            <ul className="flex items-center gap-8">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    className="nav-link smallcaps whitespace-nowrap text-[1.12rem] text-primary"
                    {...linkProps(item)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <AccountControl variant="bar" />
              </li>
            </ul>
          </nav>

          {/* On a phone the account stays in view beside the menu button, never inside it */}
          <div className="ml-auto xl:hidden">
            <AccountControl variant="bar" />
          </div>

          <button
            aria-controls="mobile-menu"
            aria-expanded={open}
            // Negative margins keep the label optically aligned while the tap target stays thumb-sized
            className="smallcaps -my-2 -mr-3 px-3 py-2 text-[1.12rem] text-primary xl:hidden"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {/* Mobile menu. Kept as a sibling of <header> so the fixed overlay isn't clipped by it. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto bg-background transition-opacity duration-300 md:top-[4.5rem] xl:hidden',
          open ? 'visible opacity-100' : 'invisible opacity-0',
        )}
        id="mobile-menu"
      >
        <nav aria-label="Mobile" className="container py-8">
          <ul className="border-t border-border">
            {items.map((item) => (
              <li className="border-b border-border" key={item.href}>
                <Link
                  className="block py-4 font-display text-[2rem] leading-tight text-primary aria-[current=page]:italic"
                  {...linkProps(item)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          {contactEmail && (
            <a className="link mt-8 inline-block" href={`mailto:${contactEmail}`}>
              {contactEmail}
            </a>
          )}
        </nav>
      </div>
    </>
  )
}
