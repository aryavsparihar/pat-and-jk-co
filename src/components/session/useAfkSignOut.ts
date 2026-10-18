'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { AFK_LIMIT_MS, afkState } from './afk'

/**
 * Watches for nobody being there, while `enabled` (someone is signed in): the away-from-the-
 * keyboard limit, which afk.ts explains. Returns the seconds left while the dialog should be up,
 * and null the rest of the time; `stay` is the dialog's answer, and `onLimit` is called once, when
 * the limit passes, to end the session.
 *
 * Every open tab shares one clock. The last moment anything was touched is kept in localStorage,
 * so reading in one tab keeps the others signed in; each tab takes whichever is later, the shared
 * moment or its own. A tab that is hidden keeps counting, so a laptop that slept through the limit
 * is signed out as soon as it wakes.
 */

/** The shared clock: when anything was last touched in any tab of this browser */
const SHARED_KEY = 'pjk-session-afk'

/** Tells the other tabs at once that someone chose to stay (the shared clock alone is throttled) */
const CHANNEL = 'pjk-session-afk'

/**
 * However much happens, the shared clock is written at most this often. It is what the other tabs
 * read, so it is also how stale their idea of this tab can be: well inside the minute the dialog
 * is up, so a tab being read in never lets another tab ask for long
 */
const WRITE_EVERY_MS = 5_000

/** What counts as somebody being there. Moving and scrolling included: reading is being there */
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const

/**
 * Outside production a test may shorten the limit — `window.__pjkAfkMs = 8000` before the page
 * loads — so the dialog and the sign-out can be driven in seconds instead of a quarter of an hour
 * (tests/e2e/session-idle.e2e.spec.ts). Production ignores it, and the most it could ever do is
 * sign somebody out sooner than they expected.
 */
const limitMs = (): number => {
  if (process.env.NODE_ENV === 'production') return AFK_LIMIT_MS
  const forced = (window as { __pjkAfkMs?: unknown }).__pjkAfkMs
  return typeof forced === 'number' && forced > 0 ? forced : AFK_LIMIT_MS
}

const sharedClock = {
  read: (): number => {
    try {
      return Number(window.localStorage.getItem(SHARED_KEY)) || 0
    } catch {
      // Private browsing or storage turned off: this tab counts its own activity alone
      return 0
    }
  },
  write: (at: number) => {
    try {
      window.localStorage.setItem(SHARED_KEY, String(at))
    } catch {
      // As above: the limit still works, tab by tab
    }
  },
}

export const useAfkSignOut = ({
  enabled,
  onLimit,
}: {
  enabled: boolean
  onLimit: () => void
}): { secondsLeft: null | number; stay: () => void } => {
  const [secondsLeft, setSecondsLeft] = useState<null | number>(null)
  const atLimit = useRef(onLimit)
  const stayRef = useRef<() => void>(() => {})

  useEffect(() => {
    atLimit.current = onLimit
  }, [onLimit])

  useEffect(() => {
    if (!enabled) return

    // A test that counts the limit in seconds needs the shared clock written in fractions of
    // them, or one tab would never hear of another in time
    const writeEvery = Math.max(200, Math.min(WRITE_EVERY_MS, limitMs() / 10))

    // Opening the page is being there
    let touched = Date.now()
    let written = touched
    sharedClock.write(touched)

    let warning = false
    let finished = false
    let timer = 0
    let channel: BroadcastChannel | null = null

    // A page in a frame — the admin's live preview — lends its activity to the shared clock and
    // nothing else: clicking about in the preview counts as being there, and the panel around it
    // is the one that asks and signs out
    const framed = window.top !== window.self

    const tick = () => {
      if (finished) return
      const state = afkState(Date.now() - Math.max(touched, sharedClock.read()), limitMs())
      if (state.phase === 'over') {
        finished = true
        window.clearTimeout(timer)
        atLimit.current()
        return
      }
      if (state.phase === 'warning') {
        warning = true
        setSecondsLeft(state.secondsLeft)
      } else {
        // Nobody is being asked: either nothing has been asked yet, or another tab was used
        // while this one was asking. Setting what is already set costs React nothing
        warning = false
        setSecondsLeft(null)
      }
      window.clearTimeout(timer)
      timer = window.setTimeout(tick, state.checkInMs)
    }

    const activity = () => {
      // While the dialog is up only its buttons count: a nudged mouse or a passing cat must not
      // keep the session going
      if (warning || finished) return
      const at = Date.now()
      touched = at
      if (at - written < writeEvery) return
      written = at
      sharedClock.write(at)
    }

    const stay = () => {
      if (finished) return
      const at = Date.now()
      touched = at
      written = at
      sharedClock.write(at)
      channel?.postMessage(at)
      warning = false
      setSecondsLeft(null)
      tick()
    }
    stayRef.current = stay

    /** Someone is there in another tab: as good as here */
    const elsewhere = (at: number) => {
      if (!Number.isFinite(at) || at <= touched) return
      touched = at
      if (!warning) return
      warning = false
      setSecondsLeft(null)
    }

    // Not activity, only a reason to look again: coming back to a tab after twenty minutes away
    // must find the limit passed, not reset it
    const look = () => tick()

    const stored = (event: StorageEvent) => {
      if (event.key === SHARED_KEY) elsewhere(Number(event.newValue))
    }

    for (const event of ACTIVITY) {
      window.addEventListener(event, activity, { capture: true, passive: true })
    }
    if (!framed) {
      document.addEventListener('visibilitychange', look)
      window.addEventListener('focus', look)
      window.addEventListener('pageshow', look)
      window.addEventListener('storage', stored)
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel(CHANNEL)
        channel.onmessage = (event: MessageEvent) => elsewhere(Number(event.data))
      }
      // The first look waits for the browser's next turn, so no render follows straight from here
      timer = window.setTimeout(tick, 0)
    }

    return () => {
      finished = true
      window.clearTimeout(timer)
      for (const event of ACTIVITY) {
        window.removeEventListener(event, activity, { capture: true })
      }
      document.removeEventListener('visibilitychange', look)
      window.removeEventListener('focus', look)
      window.removeEventListener('pageshow', look)
      window.removeEventListener('storage', stored)
      channel?.close()
    }
  }, [enabled])

  // Nothing is asked of somebody who is no longer signed in, whatever the last count was
  return {
    secondsLeft: enabled ? secondsLeft : null,
    stay: useCallback(() => stayRef.current(), []),
  }
}
