'use client'

import { useEffect, useState } from 'react'

/** What a reveal lasts, when the server does not say: the /reveal endpoint in src/collections/KycRecords.ts */
const LIFE_SECONDS = 60

export type Reveal = {
  /** The full values, held here and nowhere else: never storage, never a cache */
  values: Record<string, string>
  /** How many seconds the server gave them (src/collections/KycRecords.ts) */
  seconds?: number
  /** When they reached this device, by this device's own clock: what the minute is measured from */
  gotAt: number
}

/**
 * What a reveal has left, in milliseconds, measured on this device's own clock from the moment the
 * values arrived on it. Counting a second per `setInterval` tick instead would mean the minute
 * lasted as long as the browser cared to run the timer: a tab in the background has its timers
 * slowed to about one a minute, so the minute became an hour, and a frozen tab never finished it
 * at all — leaving someone's full PAN, Aadhaar and bank details sitting on a screen the staff
 * member had walked away from.
 */
export const revealLeft = (reveal: Reveal, now = Date.now()): number =>
  Math.min(reveal.seconds ?? LIFE_SECONDS, LIFE_SECONDS) * 1000 - (now - reveal.gotAt)

/**
 * The revealed values and the seconds they have left. They are dropped as soon as the time is up —
 * on the next repaint, or the moment the page is looked at again, whichever comes first, so a tab
 * that was slowed or frozen hides them on return rather than when its next tick happens to fire.
 */
export const useReveal = (): {
  values: Record<string, string> | null
  left: number
  show: (values: Record<string, string>, seconds?: number) => void
  hide: () => void
} => {
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!reveal) return
    const tick = () => {
      const at = Date.now()
      setNow(at)
      if (revealLeft(reveal, at) <= 0) setReveal(null)
    }
    // Counts from now, not from whenever this panel was first rendered
    queueMicrotask(tick)
    const timer = setInterval(tick, 1000)
    /*
     * The interval only repaints the number; it does not measure the minute, and in a background
     * tab it fires about once a minute, in a frozen one not at all. So the time left is worked out
     * again the moment the page is looked at, rather than waiting for the next tick.
     */
    const events: [EventTarget, string][] = [
      [document, 'visibilitychange'],
      [window, 'focus'],
      [window, 'pageshow'],
    ]
    for (const [target, event] of events) target.addEventListener(event, tick)
    return () => {
      clearInterval(timer)
      for (const [target, event] of events) target.removeEventListener(event, tick)
    }
  }, [reveal])

  const left = reveal ? revealLeft(reveal, now) : 0
  return {
    // Up means gone, whatever the last tick painted
    values: reveal && left > 0 ? reveal.values : null,
    left: Math.max(0, Math.ceil(left / 1000)),
    show: (values, seconds) => setReveal({ values, seconds, gotAt: Date.now() }),
    hide: () => setReveal(null),
  }
}
