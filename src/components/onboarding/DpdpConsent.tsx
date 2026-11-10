'use client'

import React, { useEffect, useRef, useState } from 'react'

import {
  DPDP_CHECKBOX,
  DPDP_NOTICE,
  DPDP_NOTICE_HEADING,
  DPDP_TYPE_PROMPT,
} from '@/members/dpdpNotice'

/** I AGREE, whatever the capitals or spacing, with or without the full stop the notice shows */
export const typedAgree = (typed: string | null | undefined): boolean =>
  (typed ?? '').trim().replace(/\s+/g, ' ').replace(/\.$/, '').toUpperCase() === 'I AGREE'

/**
 * The last section of both onboarding forms: the full privacy policy in a box the applicant
 * scrolls through, the founder's pre-submission notice, then the consent box and I AGREE typed
 * in. The box can be ticked once the policy has been scrolled to its end.
 */
export const DpdpConsent: React.FC<{
  id: string
  privacy: React.ReactNode
  checked: boolean
  onChecked: (checked: boolean) => void
  typed: string
  onTyped: (typed: string) => void
  onReadToEnd?: () => void
  errors?: { checked?: string; typed?: string }
}> = ({ id, privacy, checked, onChecked, typed, onTyped, onReadToEnd, errors = {} }) => {
  const box = useRef<HTMLDivElement>(null)
  const [readToEnd, setReadToEnd] = useState(checked)

  const checkEnd = () => {
    const el = box.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true)
  }
  useEffect(() => {
    if (readToEnd) onReadToEnd?.()
  }, [readToEnd, onReadToEnd])

  return (
    <fieldset className="mt-14 border-t border-border-strong pt-8" id={`field-${id}`}>
      <legend className="display-sm mb-6">{DPDP_NOTICE_HEADING}</legend>
      <div
        aria-label="The privacy policy"
        className="max-h-[min(70dvh,34rem)] overflow-y-auto overscroll-contain border border-border bg-[var(--surface)] px-5 py-6 sm:px-8"
        onScroll={checkEnd}
        ref={(el) => {
          box.current = el
          if (el) requestAnimationFrame(checkEnd)
        }}
        role="region"
        tabIndex={0}
      >
        {privacy}
      </div>
      <p className="muted mt-2 text-base">
        {readToEnd
          ? 'You have reached the end of the policy.'
          : 'Scroll to the end of the policy to continue.'}
      </p>

      <p className="measure mt-8 font-semibold">{DPDP_NOTICE}</p>

      <label
        className={`mt-6 flex min-h-11 items-start gap-4 py-2 ${readToEnd ? 'cursor-pointer' : 'opacity-60'}`}
      >
        <input
          aria-describedby={errors.checked ? `field-${id}-error` : undefined}
          aria-invalid={errors.checked ? true : undefined}
          checked={checked}
          className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
          disabled={!readToEnd}
          name={`${id}-checked`}
          onChange={(e) => onChecked(e.target.checked)}
          type="checkbox"
        />
        <span className="measure">{DPDP_CHECKBOX}</span>
      </label>
      {errors.checked && (
        <p className="ml-9 mt-1 text-base italic text-destructive" id={`field-${id}-error`}>
          {errors.checked}
        </p>
      )}

      <div className="mt-6">
        <label className="label mb-1 block" htmlFor={`${id}-typed`}>
          {DPDP_TYPE_PROMPT}
        </label>
        <input
          aria-describedby={errors.typed ? `field-${id}-typed-error` : undefined}
          aria-invalid={errors.typed ? true : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full max-w-xs border-0 border-b border-input bg-transparent px-0 py-2 text-[1.15rem] tracking-wider focus:border-primary focus:outline-none"
          id={`${id}-typed`}
          onChange={(e) => onTyped(e.target.value)}
          spellCheck={false}
          value={typed}
        />
        {errors.typed && (
          <p className="mt-1 text-base italic text-destructive" id={`field-${id}-typed-error`}>
            {errors.typed}
          </p>
        )}
      </div>
    </fieldset>
  )
}
