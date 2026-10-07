'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import { api } from '@/components/onboarding/api'
import { cn } from '@/utilities/ui'

/**
 * Sign in, or the account and Sign out, in the header on every page. Pages are served from the
 * cache, so who is signed in is asked from the browser. It shows Sign in until the answer comes,
 * as most visitors are not signed in, so the header does not jump for them. It asks again when a
 * form signs someone in or out without a page load (SESSION_CHANGED), and on returning to the tab.
 */

/** Sent by a form that signs a member in or out without loading a new page */
export const SESSION_CHANGED = 'pjk:session-changed'
export const AccountControl: React.FC<{ variant: 'bar' | 'menu' }> = ({ variant }) => {
  const [signedIn, setSignedIn] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let current = true
    const check = () =>
      void api<{ signedIn?: boolean }>('/next/members/session').then((result) => {
        if (current) setSignedIn(result.data.signedIn === true)
      })
    const onVisible = () => document.visibilityState === 'visible' && check()
    check()
    window.addEventListener(SESSION_CHANGED, check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      current = false
      window.removeEventListener(SESSION_CHANGED, check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const signOut = async () => {
    setBusy(true)
    await api('/next/members/sign-out', { body: {} })
    // A full page load, so nothing the page held about the account stays in memory
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/')
  }

  const button = cn(
    'smallcaps inline-flex min-h-10 items-center whitespace-nowrap border border-[var(--ink)] px-3 text-[1.05rem] sm:px-4 text-primary transition-colors hover:bg-primary hover:text-primary-foreground',
    variant === 'menu' && 'min-h-11 px-5',
  )

  if (!signedIn) {
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
        href="/account"
      >
        Account
      </Link>
      <button className={button} disabled={busy} onClick={signOut} type="button">
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </span>
  )
}
