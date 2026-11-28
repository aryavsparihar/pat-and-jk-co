'use client'

import Link from '@/components/IntentLink'
import React, { useEffect, useId, useRef, useState } from 'react'

import {
  announceSessionChange,
  markLeaving,
  useIsArtist,
  useSession,
} from '@/components/session/sessionStore'

/**
 * Sign in, or Your account, at the end of the header on every page (the founder's brief, section
 * 2). Pages are served from the cache and are the same for everyone, so the cached page always
 * says Sign in; who is actually signed in comes from the browser (src/components/session/
 * sessionStore.ts). Once signed in, Your account opens a small menu: Your account, Your works for
 * artists only (trade partners do not see it), and Sign out. Staff see Open the admin instead.
 */

/** Kept for the forms that import it from here */
export { SESSION_CHANGED } from '@/components/session/sessionStore'

const Chevron = () => (
  <svg
    aria-hidden
    fill="none"
    height="6"
    stroke="currentColor"
    strokeWidth="1.3"
    viewBox="0 0 10 6"
    width="10"
  >
    <path d="M1 1l4 4 4-4" />
  </svg>
)

export const AccountControl: React.FC = () => {
  const session = useSession()
  const artist = useIsArtist()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const menuId = useId()

  // Closes on a click elsewhere or Escape, as menus do
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const signOut = async () => {
    setBusy(true)
    markLeaving()
    try {
      await fetch(session === 'staff' ? '/api/users/logout' : '/next/members/sign-out', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    } finally {
      // Every other open tab updates too; then a full page load, so nothing the page held about
      // the account stays in memory
      announceSessionChange()
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/')
    }
  }

  if (session !== 'member' && session !== 'staff') {
    return (
      <Link className="header-link whitespace-nowrap" href="/collaborate/signin">
        Sign in
      </Link>
    )
  }

  const items =
    session === 'staff'
      ? [{ href: '/admin', label: 'Open the admin' }]
      : [
          { href: '/account', label: 'Your account' },
          ...(artist ? [{ href: '/account/works', label: 'Your works' }] : []),
        ]

  return (
    <span className="relative inline-flex" ref={box}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className="header-link inline-flex items-center gap-2 whitespace-nowrap"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {/* A phone has room for one short word beside the wordmark and Menu */}
        <span className="sm:hidden">Account</span>
        <span className="hidden sm:inline">Your account</span> <Chevron />
      </button>
      {open && (
        <span className="account-menu" id={menuId} role="menu">
          {items.map((item) => (
            <Link
              className="account-menu-item"
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              {item.label}
            </Link>
          ))}
          <button
            className="account-menu-item account-menu-last"
            disabled={busy}
            onClick={signOut}
            role="menuitem"
            type="button"
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </span>
      )}
    </span>
  )
}
