'use client'

import { useSyncExternalStore } from 'react'

import { readSessionHint, type SessionKind } from '@/utilities/sessionHint'

/**
 * Who is signed in, as the header sees it: one answer per page, shared by every place that shows
 * it (the menu's two copies, the admin bar), from /next/session, never from the cached HTML.
 *
 *   unknown   not asked yet; shown as signed out, which is what the cached page says
 *   none      no one
 *   member    an artist or partner
 *   staff     someone signed in to the admin
 *
 * It asks only when it is worth it: when the hint cookie says someone may be signed in, or the
 * first time this browser is asked at all (src/utilities/sessionHint.ts). It asks again
 *
 *   - when this tab signs someone in or out (announceSessionChange)
 *   - when another tab does, by BroadcastChannel, or a storage event where that is missing
 *   - on coming back to the tab, and when the browser restores the page from its back/forward
 *     cache (Safari and Firefox do on Back, without running anything), so a page left before
 *     signing out never keeps showing Sign out
 *   - every few minutes while someone is signed in and the tab is open, so an expired session
 *     shows as signed out without a reload
 */

export type SessionState = SessionKind | 'none' | 'unknown'

/** Fired in this tab by anything that signs someone in or out without loading a new page */
export const SESSION_CHANGED = 'pjk:session-changed'

const CHANNEL = 'pjk-session'
const PING_KEY = 'pjk-session-ping'
const ASKED_KEY = 'pjk-session-asked'
const RECHECK_MS = 5 * 60_000

let state: SessionState = 'unknown'
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null
let started = false
let channel: BroadcastChannel | null = null

const set = (next: SessionState) => {
  if (next === state) return
  state = next
  for (const listener of listeners) listener()
}

const storage = {
  get: (key: string) => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Private browsing or storage turned off: the hint cookie still does the work
    }
  },
}

/** Asks the server, now; concurrent callers share one request */
export const refreshSession = (): Promise<void> => {
  inflight ??= (async () => {
    try {
      const response = await fetch('/next/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(String(response.status))
      const { as } = (await response.json()) as { as?: string | null }
      set(as === 'member' || as === 'staff' ? as : 'none')
    } catch {
      // Offline or a hiccup: keep showing what we had, and treat "not yet known" as signed out
      if (state === 'unknown') set('none')
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Asks only when someone may be signed in; otherwise knows, without a request, that no one is */
const check = () => {
  if (readSessionHint(document.cookie)) return void refreshSession()
  if (storage.get(ASKED_KEY) !== '1') {
    // Marked before the answer arrives, so a visitor who moves on at once is not asked again on
    // every page while the first answer is still on its way
    storage.set(ASKED_KEY, '1')
    return void refreshSession()
  }
  set('none')
}

/** Tells this tab and every other open tab that someone signed in or out */
export const announceSessionChange = () => {
  window.dispatchEvent(new Event(SESSION_CHANGED))
  channel?.postMessage('changed')
  storage.set(PING_KEY, String(Date.now()))
}

const start = () => {
  if (started || typeof window === 'undefined') return
  started = true
  check()
  window.addEventListener(SESSION_CHANGED, () => void refreshSession())
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = () => void refreshSession()
  }
  // Where BroadcastChannel is missing; harmless where it is not (one more check)
  window.addEventListener('storage', (event) => {
    if (event.key === PING_KEY) void refreshSession()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) check()
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && (state === 'member' || state === 'staff')) {
      void refreshSession()
    }
  }, RECHECK_MS)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  start()
  return () => listeners.delete(listener)
}

/** The signed-in state, kept up to date; "unknown" while rendering on the server or first paint */
export const useSession = (): SessionState =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => 'unknown',
  )
