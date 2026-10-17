'use client'

import { useAuth } from '@payloadcms/ui'
import React, { useEffect, useRef } from 'react'

import { readSessionHint, SESSION_HINT_COOKIE } from '@/utilities/sessionHint'

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
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    if (signedIn) {
      document.cookie = `${SESSION_HINT_COOKIE}=staff; Path=/; SameSite=Lax; Max-Age=${STAFF_HINT_SECONDS}${secure}`
    } else if (readSessionHint(document.cookie) === 'staff') {
      document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`
    }
    if (!changed) return
    try {
      new BroadcastChannel('pjk-session').postMessage('changed')
      window.localStorage.setItem('pjk-session-ping', String(Date.now()))
    } catch {
      // An old browser or storage turned off: the site's tabs ask again when next shown
    }
  }, [user])

  return <>{children}</>
}
