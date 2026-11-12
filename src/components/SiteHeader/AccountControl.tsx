'use client'

import Link from '@/components/IntentLink'
import React, { useEffect, useId, useRef, useState } from 'react'

import { announceSessionChange, useSession } from '@/components/session/sessionStore'
import { cn } from '@/utilities/ui'

/**
 * Sign in, or My Account, in the header on every page. Pages are served from the cache and are
 * the same for everyone, so the cached page always says Sign in; who is actually signed in comes
 * from the browser (src/components/session/sessionStore.ts). Once signed in, My Account (green,
 * white text) opens a small menu: View My Account, and Sign Out.
 */

/** Kept for the forms that import it from here */
export { SESSION_CHANGED } from '@/components/session/sessionStore'

export const AccountControl: React.FC<{ variant: 'bar' | 'menu' }> = ({ variant }) => {
  const session = useSession()
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

  const size = cn(
    'smallcaps inline-flex min-h-10 items-center whitespace-nowrap border px-3 text-[1.05rem] sm:px-4',
    variant === 'menu' && 'min-h-11 px-5',
  )

  if (session !== 'member' && session !== 'staff') {
    return (
      <Link
        className={cn(
          size,
          'border-[var(--ink)] text-primary transition-colors hover:bg-primary hover:text-primary-foreground',
        )}
        href="/collaborate/signin"
      >
        Sign in
      </Link>
    )
  }

  const item =
    'smallcaps flex min-h-11 w-full items-center whitespace-nowrap px-4 text-left text-[1.05rem] text-primary hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)]'
  return (
    <span className="relative inline-flex" ref={box}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          size,
          'border-primary bg-primary text-primary-foreground transition-opacity hover:opacity-90',
        )}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        My Account
      </button>
      {open && (
        <span
          className="absolute right-0 top-full z-50 mt-2 min-w-48 border border-border bg-background py-1 shadow-sm"
          id={menuId}
          role="menu"
        >
          <Link
            className={item}
            href={session === 'staff' ? '/admin' : '/account'}
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            {session === 'staff' ? 'Open the admin' : 'View My Account'}
          </Link>
          <button className={item} disabled={busy} onClick={signOut} role="menuitem" type="button">
            {busy ? 'Signing out…' : 'Sign Out'}
          </button>
        </span>
      )}
    </span>
  )
}
