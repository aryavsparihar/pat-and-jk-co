'use client'

import React, { useEffect, useState } from 'react'

import { Sending } from '../../Sending'

export type Code = { code: string; expiresAt: string }

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The code to write on the paper, and how long it has left. Ten minutes from when it was given;
 * then one tap gives a new one, and the old one stops working on the server. Only this part is
 * timed: nothing else in the step expires or resets. A screen reader hears when a minute is
 * left and when it has run out, not every second.
 */
export const IdentityCode: React.FC<{
  code: Code | null
  busy: boolean
  onNew: () => void
  /** What to offer while the code holds: the ways to take the photo */
  children?: React.ReactNode
}> = ({ code, busy, onNew, children }) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!code) return
    // Counts from now, not from when the page opened
    const tick = () => setNow(Date.now())
    queueMicrotask(tick)
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [code])

  if (!code) {
    return (
      <button className="btn btn-solid min-h-11" disabled={busy} onClick={onNew} type="button">
        {busy ? <Sending label="Getting your code" /> : 'Show my code'}
      </button>
    )
  }

  // Never more than the ten minutes a code lasts, whatever the device's clock says
  const left = Math.min(new Date(code.expiresAt).getTime() - now, 10 * 60_000)
  const expired = left <= 0
  return (
    <div>
      <div
        className={`w-fit border px-7 py-5 transition-opacity ${expired ? 'border-border opacity-50' : 'border-border-strong bg-surface'}`}
      >
        <p className="label">Your code</p>
        <p
          aria-label={`Your code: ${code.code.split('').join(' ')}`}
          className="mt-2 select-all font-display text-[clamp(2rem,6vw,2.75rem)] leading-none tracking-[0.18em] text-primary [font-variant-numeric:lining-nums]"
        >
          {code.code}
        </p>
        <p aria-hidden className="muted mt-3 text-base tabular-nums">
          {expired ? 'This code has run out.' : `Valid for ${clock(left)}`}
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        {expired
          ? 'Your code has run out. You can get a new one.'
          : left <= 60_000
            ? 'One minute left on your code.'
            : ''}
      </p>
      {expired ? (
        <div className="mt-4">
          <p className="measure text-base">
            Codes last ten minutes. Get a new one, write it on your paper in place of the old one,
            and take the photo again.
          </p>
          <button
            className="btn btn-solid mt-4 min-h-11"
            disabled={busy}
            onClick={onNew}
            type="button"
          >
            {busy ? <Sending label="Getting a new code" /> : 'Get a new code'}
          </button>
        </div>
      ) : (
        <>
          <button
            className="link link-caps mt-3 min-h-11"
            disabled={busy}
            onClick={onNew}
            type="button"
          >
            Get a new code
          </button>
          <div className="mt-6">{children}</div>
        </>
      )}
    </div>
  )
}
