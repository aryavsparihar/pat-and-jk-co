'use client'

import React, { useCallback, useEffect, useRef } from 'react'

import type { TurnstileAction } from '@/security/turnstile'

/**
 * Cloudflare Turnstile in the browser, for the forms the server checks (src/security/turnstile.ts).
 * The widget stays out of sight unless Cloudflare wants the person to tick a box, and a fresh
 * token is asked for on every submission, so "send a new code" works as well as the first send.
 *
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY (a developer's machine, the tests) nothing loads and
 * getToken() gives null; the server skips its check there too.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

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

let loading: Promise<Turnstile> | null = null

const load = () =>
  (loading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('load')))
    script.onerror = () => {
      loading = null
      reject(new Error('load'))
    }
    document.head.appendChild(script)
  }))

export const turnstileOn = Boolean(SITE_KEY)

export const useTurnstile = (action: TurnstileAction) => {
  const container = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const waiting = useRef<((token: string | null) => void) | null>(null)

  const settle = (token: string | null) => {
    waiting.current?.(token)
    waiting.current = null
  }

  useEffect(() => {
    if (!SITE_KEY || !container.current) return
    let cancelled = false
    load()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        widget.current = turnstile.render(container.current, {
          sitekey: SITE_KEY,
          action,
          execution: 'execute',
          appearance: 'interaction-only',
          theme: 'light',
          size: 'flexible',
          callback: (token: string) => settle(token),
          'error-callback': () => {
            settle(null)
            return true
          },
          'expired-callback': () => settle(null),
          'timeout-callback': () => settle(null),
        })
      })
      .catch(() => settle(null))
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [action])

  /** A fresh token for one submission; null when Turnstile is off or could not run */
  const getToken = useCallback(async (): Promise<string | null> => {
    if (!SITE_KEY) return null
    try {
      const turnstile = await load()
      // The widget renders once the script has loaded; give it a moment on a slow connection
      for (let i = 0; i < 50 && !widget.current; i++) await new Promise((r) => setTimeout(r, 100))
      if (!widget.current) return null
      const id = widget.current
      return await new Promise<string | null>((resolve) => {
        waiting.current = resolve
        turnstile.reset(id)
        turnstile.execute(id)
      })
    } catch {
      return null
    }
  }, [])

  const element = <div className="mt-6 empty:hidden" ref={container} />

  return { element, getToken }
}
