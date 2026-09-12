'use client'

import { cn } from '@/utilities/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState, useSyncExternalStore } from 'react'

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
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  // Close the mobile menu whenever the route changes (state reset during render, per React docs)
  const [menuPath, setMenuPath] = useState(livePathname)
  if (menuPath !== livePathname) {
    setMenuPath(livePathname)
    setOpen(false)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-500',
          scrolled || open
            ? 'border-b border-border bg-background/90 backdrop-blur-md'
            : 'border-b border-transparent bg-background/0',
        )}
      >
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-background focus:px-4 focus:py-2"
          href="#main"
        >
          Skip to content
        </a>

        <div className="container flex h-[4.5rem] items-center justify-between gap-8 md:h-20">
          <Link aria-label={`${siteName} — home`} className="shrink-0 text-primary" href="/">
            {logo}
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-9">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    className="nav-link text-[0.72rem] font-medium uppercase tracking-[0.2em] text-foreground/80 transition-colors hover:text-primary aria-[current=page]:text-primary"
                    {...linkProps(item)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-4">
            {cta && (
              <Link className="btn btn-outline btn-sm hidden sm:inline-flex" {...linkProps(cta)}>
                {cta.label}
              </Link>
            )}
            <button
              aria-controls="mobile-menu"
              aria-expanded={open}
              className="flex h-10 items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.22em] lg:hidden"
              onClick={() => setOpen((v) => !v)}
              type="button"
            >
              <span>{open ? 'Close' : 'Menu'}</span>
              <span aria-hidden className="relative block h-2.5 w-6">
                <span
                  className={cn(
                    'absolute left-0 top-0 h-px w-full bg-current transition-transform duration-500',
                    open && 'translate-y-[5px] rotate-45',
                  )}
                />
                <span
                  className={cn(
                    'absolute bottom-0 left-0 h-px w-full bg-current transition-transform duration-500',
                    open && '-translate-y-[4px] -rotate-45',
                  )}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu — a sibling of <header>, because the header's backdrop-filter would
          otherwise become the containing block for this fixed overlay and clip it */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 top-[4.5rem] z-30 flex flex-col overflow-y-auto bg-background transition-[opacity,visibility] duration-500 md:top-20 lg:hidden',
          open ? 'visible opacity-100' : 'invisible opacity-0',
        )}
        id="mobile-menu"
      >
        <nav aria-label="Mobile" className="container flex flex-1 flex-col justify-between py-12">
          <ul className="space-y-2">
            {[...nav, ...(cta ? [cta] : [])].map((item, i) => (
              <li
                className={cn(
                  'transition-[opacity,transform] duration-700',
                  open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
                )}
                key={item.href}
                style={{ transitionDelay: open ? `${80 + i * 50}ms` : '0ms' }}
              >
                <Link
                  className="block py-2 font-serif text-[2.4rem] leading-tight aria-[current=page]:italic aria-[current=page]:text-primary"
                  {...linkProps(item)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-12 border-t border-border pt-8">
            <span aria-hidden className="ornament mb-6 block text-primary" />
            {contactEmail && (
              <a className="font-serif text-xl" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            )}
          </div>
        </nav>
      </div>
    </>
  )
}
