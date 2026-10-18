'use client'

import Link from '@/components/IntentLink'
import React, { useState } from 'react'

import { RowArrow } from '@/components/RowArrow'

/**
 * The way in for artists on Phulhaar's venture page. Its ground is a soft gradient in Phulhaar's
 * palette that moves on hover, on keyboard focus, and while pressed: iPads have no hover, and
 * Safari does not show :active on a plain link, so a press is marked here (data-pressed). The
 * motion stops under prefers-reduced-motion; the colour change stays, as a change of state.
 */
export const InviteCard: React.FC<{
  href: string
  label: string
  heading: string
  text: string
  action: string
}> = ({ href, label, heading, text, action }) => {
  const [pressed, setPressed] = useState(false)
  const release = () => setPressed(false)
  return (
    <Link
      className="phulhaar-invite row-link intro-line mx-auto block max-w-[46rem] border border-[color-mix(in_oklab,var(--gold,var(--primary))_35%,transparent)] border-t-2 border-t-[var(--gold,var(--primary))] p-7 [--intro-delay:1.4s] sm:p-10"
      data-pressed={pressed || undefined}
      href={href}
      onPointerCancel={release}
      onPointerDown={() => setPressed(true)}
      onPointerLeave={release}
      onPointerUp={release}
    >
      <span className="label block text-[var(--gold-text,var(--primary))]">{label}</span>
      <span className="display-md row-title mt-3 block">{heading}</span>
      <span className="measure mt-4 block">{text}</span>
      <span className="phulhaar-invite-action link-caps mt-8 inline-flex items-center gap-4">
        {action}
        <RowArrow />
      </span>
    </Link>
  )
}
