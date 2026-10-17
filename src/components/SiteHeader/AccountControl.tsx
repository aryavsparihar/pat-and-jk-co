'use client'

import Link from '@/components/IntentLink'
import React, { useState } from 'react'

import { announceSessionChange, useSession } from '@/components/session/sessionStore'
import { cn } from '@/utilities/ui'

/**
 * Sign in, or the account and Sign out, in the header on every page. Pages are served from the
 * cache and are the same for everyone, so the cached page always says Sign in; who is actually
 * signed in comes from the browser (src/components/session/sessionStore.ts), and only then does
 * this show the account or the admin, and Sign out.
 */

/** Kept for the forms that import it from here */
export { SESSION_CHANGED } from '@/components/session/sessionStore'

export const AccountControl: React.FC<{ variant: 'bar' | 'menu' }> = ({ variant }) => {
  const session = useSession()
  const [busy, setBusy] = useState(false)

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

  const button = cn(
    'smallcaps inline-flex min-h-10 items-center whitespace-nowrap border border-[var(--ink)] px-3 text-[1.05rem] sm:px-4 text-primary transition-colors hover:bg-primary hover:text-primary-foreground',
    variant === 'menu' && 'min-h-11 px-5',
  )

  if (session !== 'member' && session !== 'staff') {
    return (
      <Link className={button} href="/collaborate/signin">
        Sign in
      </Link>
    )
  }
  return (
    <span className={cn('flex items-center', variant === 'bar' ? 'gap-5' : 'gap-6')}>
      <Link
        className={cn(
          'nav-link smallcaps whitespace-nowrap text-primary',
          variant === 'bar' ? 'hidden text-[1.12rem] sm:inline' : 'text-[1.12rem]',
        )}
        href={session === 'staff' ? '/admin' : '/account'}
      >
        {session === 'staff' ? 'Admin' : 'Account'}
      </Link>
      <button className={button} disabled={busy} onClick={signOut} type="button">
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </span>
  )
}
