'use client'

import React, { useCallback, useEffect, useRef } from 'react'

import type { TurnstileAction } from '@/security/turnstile'

/**
 * Cloudflare Turnstile in the browser, for the forms the server checks (src/security/turnstile.ts).
 * The widget stays out of sight unless Cloudflare wants the person to tick a box, and a fresh
 * token is asked for on every submission, so "send a new code" works as well as the first send.
 *
 * It never leaves a form waiting. If the script cannot load (Brave Shields and privacy extensions
 * often block it), the widget fails, or no answer comes in time, getToken() says why, and the form
 * tells the person what to do instead of sending something the server will refuse. The clock stops
 * while Cloudflare is showing a box to tick, so nobody is cut off mid-check.
 *
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY (a developer's machine, the tests) nothing loads, and
 * getToken() gives no token and no problem; the server skips its check there too.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const LOAD_TIMEOUT_MS = 10_000
const ANSWER_TIMEOUT_MS = 20_000

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  execute: (widget: string) => void
  reset: (widget: string) => void
  remove: (widget: string) => void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

/** Why there is no token: the check could not load, or it ran and did not pass */
export type BotCheckProblem = 'blocked' | 'failed'
export type BotCheckResult = { token: string | null; problem?: BotCheckProblem }

let loading: Promise<Turnstile> | null = null

const load = () =>
  (loading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const fail = () => {
      // Try afresh next time: the person may have allowed it in the meantime
      loading = null
      script.remove()
      reject(new Error('blocked'))
    }
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS)
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => {
      clearTimeout(timer)
      if (window.turnstile) resolve(window.turnstile)
      else fail()
    }
    script.onerror = () => {
      clearTimeout(timer)
      fail()
    }
    document.head.appendChild(script)
  }))

export const turnstileOn = Boolean(SITE_KEY)

export const useTurnstile = (action: TurnstileAction) => {
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const waiting = useRef<((result: BotCheckResult) => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const settle = (result: BotCheckResult) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    waiting.current?.(result)
    waiting.current = null
  }

  const render = useCallback(
    (turnstile: Turnstile) => {
      if (widget.current || !container.current) return
      widget.current = turnstile.render(container.current, {
        sitekey: SITE_KEY,
        action,
        execution: 'execute',
        appearance: 'interaction-only',
        theme: 'light',
        size: 'flexible',
        callback: (token: string) => settle({ token }),
        'error-callback': () => {
          settle({ token: null, problem: 'failed' })
          return true
        },
        'unsupported-callback': () => settle({ token: null, problem: 'failed' }),
        'expired-callback': () => settle({ token: null, problem: 'failed' }),
        'timeout-callback': () => settle({ token: null, problem: 'failed' }),
        // A box to tick is showing: wait for the person, however long they take
        'before-interactive-callback': () => {
          if (timer.current) clearTimeout(timer.current)
          timer.current = null
        },
      })
    },
    [action],
  )

  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false
    load()
      .then((turnstile) => {
        if (!cancelled) render(turnstile)
      })
      // Reported when the person submits, not before
      .catch(() => {})
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [render])

  /** A fresh token for one submission, or why there is none */
  const getToken = useCallback(async (): Promise<BotCheckResult> => {
    if (!SITE_KEY) return { token: null }
    let turnstile: Turnstile
    try {
      turnstile = await load()
      render(turnstile)
    } catch {
      return { token: null, problem: 'blocked' }
    }
    const id = widget.current
    if (!id) return { token: null, problem: 'blocked' }
    return new Promise<BotCheckResult>((resolve) => {
      waiting.current = resolve
      timer.current = setTimeout(
        () => settle({ token: null, problem: 'failed' }),
        ANSWER_TIMEOUT_MS,
      )
      try {
        turnstile.reset(id)
        turnstile.execute(id)
      } catch {
        settle({ token: null, problem: 'failed' })
      }
    })
  }, [render])

  const element = <div className="mt-6 empty:hidden" ref={container} />

  return { element, getToken }
}
