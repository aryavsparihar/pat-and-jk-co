'use client'

import React, { useEffect, useId, useRef, useState } from 'react'

import type { AccountView } from '@/members/accountView'

const OPTIONS: { view: AccountView; label: string }[] = [
  { view: 'artist', label: 'Artist Account' },
  { view: 'partner', label: 'Trade Program Account' },
]

const SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/**
 * "Your Account" in the margin of the account pages. For a member whose email holds both an
 * Artist ID and a Trade Partner ID it is a green button that opens the two accounts, Artist
 * Account and Trade Program Account, to switch between (the founder's design of 22 November
 * 2026). Everyone else sees the plain label, as before.
 */
export const AccountSwitcher: React.FC<{ current: AccountView }> = ({ current }) => {
  const [both, setBoth] = useState(false)
  const [open, setOpen] = useState(false)
  const menu = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetch('/next/members/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setBoth(Boolean(s?.member?.artistId && s?.member?.partnerId)))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !box.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (!both) return <>Your account</>

  return (
    <div ref={box} className="relative inline-block normal-case tracking-normal">
      <button
        aria-controls={menu}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-sm px-4 text-[0.9375rem] font-medium"
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'var(--primary)', color: '#fff', fontFamily: SANS }}
        type="button"
      >
        Your Account
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul
          className="absolute left-0 z-20 mt-2 min-w-[15rem] border border-border bg-background py-1 shadow-lg"
          id={menu}
          style={{ fontFamily: SANS }}
        >
          {OPTIONS.map((o) => (
            <li key={o.view}>
              <a
                aria-current={o.view === current ? 'page' : undefined}
                className="flex min-h-11 items-center justify-between gap-4 px-4 text-[0.9375rem] hover:bg-surface aria-[current=page]:font-semibold"
                href={`/next/members/view?to=${o.view}`}
              >
                {o.label}
                {o.view === current && <span aria-hidden="true">✓</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
