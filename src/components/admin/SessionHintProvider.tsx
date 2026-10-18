'use client'

import { useAuth } from '@payloadcms/ui'
import React, { useEffect, useRef } from 'react'

import { pingSessionTabs, readSessionHint, writeSessionHint } from '@/utilities/sessionHint'

/** Twelve hours, the longest a staff session can last (src/collections/Users) */
const STAFF_HINT_SECONDS = 12 * 60 * 60

/**
 * Wraps the admin. When someone signs in to it, the public site's header is told to ask who is
 * signed in (the hint cookie, src/utilities/sessionHint.ts), and any open tab of the site is told
 * at once; when they sign out, the same in reverse. Never clears a member's hint: only one this
 * set for staff.
 */
export const SessionHintProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const known = useRef<boolean | null>(null)

  useEffect(() => {
    const signedIn = Boolean(user)
    if (known.current === signedIn) return
    const changed = known.current !== null
    known.current = signedIn
    if (signedIn) writeSessionHint('staff', STAFF_HINT_SECONDS)
    else if (readSessionHint(document.cookie) === 'staff') writeSessionHint(null)
    if (changed) pingSessionTabs()
  }, [user])

  return <>{children}</>
}
