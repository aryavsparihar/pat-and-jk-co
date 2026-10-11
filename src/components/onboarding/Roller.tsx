'use client'

import { cn } from '@/utilities/ui'
import React, { useEffect, useRef } from 'react'

import { idFor } from './fields'

export type RollerOption = { value: number; label: string }

/** Each row's height in px (h-10), and how many rows show at once */
const ROW = 40
const TYPE_AHEAD_MS = 800

const smooth = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/**
 * A vertical roller for choosing one of a long run of numbers: years, say. Five rows show; the
 * middle one is the choice. Scroll or swipe it and it settles on a row; click or tap a row to
 * choose it; or use the keyboard: the arrow keys, Page Up and Down, Home and End, or type the start
 * of a value. Screen readers hear it as a list box and are told the choice as it changes.
 *
 * The first row, "Choose", means nothing is chosen yet, so a required roller is never filled in
 * without the person's doing.
 */
export const Roller: React.FC<{
  name: string
  label: string
  hint?: string
  error?: string
  options: RollerOption[]
  value: number | string | null | undefined
  onValue: (value: number | undefined) => void
  placeholder?: string
  className?: string
}> = ({ name, label, hint, error, options, value, onValue, placeholder = 'Choose', className }) => {
  const id = idFor(name)
  const list = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const typed = useRef({ text: '', at: 0 })
  const mounted = useRef(false)

  const rows: { value: number | undefined; label: string }[] = [
    { value: undefined, label: placeholder },
    ...options,
  ]
  const chosen = value === '' || value === null || value === undefined ? NaN : Number(value)
  const index = Math.max(
    0,
    rows.findIndex((r) => r.value === chosen),
  )

  // Keeps the chosen row in the middle, whoever chose it
  useEffect(() => {
    const el = list.current
    if (!el) return
    const target = index * ROW
    if (Math.abs(el.scrollTop - target) > 1) {
      el.scrollTo({ top: target, behavior: mounted.current ? smooth() : 'auto' })
    }
    mounted.current = true
  }, [index])

  useEffect(() => () => clearTimeout(settle.current), [])

  const choose = (i: number) => {
    const next = Math.min(rows.length - 1, Math.max(0, i))
    if (next !== index) onValue(rows[next]!.value)
  }

  // A scroll or swipe chooses the row it comes to rest on
  const onScroll = () => {
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const el = list.current
      if (el) choose(Math.round(el.scrollTop / ROW))
    }, 120)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      PageDown: index + 10,
      PageUp: index - 10,
      Home: 1,
      End: rows.length - 1,
    }
    if (event.key in moves) {
      event.preventDefault()
      choose(moves[event.key]!)
      return
    }
    // Typing "20" goes to the first row that starts with it
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const now = event.timeStamp
      const text =
        (now - typed.current.at < TYPE_AHEAD_MS ? typed.current.text : '') + event.key.toLowerCase()
      typed.current = { text, at: now }
      const found = rows.findIndex((r, i) => i > 0 && r.label.toLowerCase().startsWith(text))
      if (found > 0) choose(found)
    }
  }

  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')

  return (
    <div className={cn('min-w-0', className)}>
      <p className="label mb-1 block" id={`${id}-label`}>
        {label}
      </p>
      {hint && (
        <p className="muted mb-2 text-base" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <div className="relative w-full max-w-[13rem]">
        {/* The band the choice sits in */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-20 h-10 border-y border-primary/50 bg-surface"
        />
        <div
          aria-activedescendant={`${id}-row-${index}`}
          aria-describedby={described || undefined}
          aria-invalid={error ? true : undefined}
          aria-labelledby={`${id}-label`}
          aria-required
          className="roller relative h-[200px] snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none focus-visible:shadow-[0_0_0_2px_var(--primary)]"
          id={id}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          ref={list}
          role="listbox"
          tabIndex={0}
        >
          <div aria-hidden className="h-20" />
          {rows.map((row, i) => (
            <div
              aria-selected={i === index}
              className={cn(
                'flex h-10 cursor-pointer snap-center items-center justify-center text-[1.15rem] tabular-nums transition-colors',
                i === index ? 'font-medium text-primary' : 'text-muted-foreground',
                i === 0 && 'text-base italic',
              )}
              id={`${id}-row-${i}`}
              key={row.label}
              onClick={() => choose(i)}
              role="option"
            >
              {row.label}
            </div>
          ))}
          <div aria-hidden className="h-20" />
        </div>
      </div>
      {error && (
        <p className="mt-2 text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}
