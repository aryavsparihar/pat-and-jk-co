import React from 'react'

import { Heading } from '@/components/Typography'

export type PhulhaarDisplay = 'cormorant' | 'marcellus'

/**
 * The artist onboarding in Phulhaar's identity (docs/BRANDS.md): the cream ground, and beside a
 * calm form column, the garland, breathing slowly. On a phone the garland sits small above the
 * form. The wordmark carries the name; it is artwork, never set as text.
 */
export const PhulhaarPage: React.FC<{
  label: string
  heading: string
  intro: React.ReactNode
  display?: PhulhaarDisplay
  children: React.ReactNode
}> = ({ label, heading, intro, display = 'cormorant', children }) => (
  <div className="brand-theme phulhaar" data-display={display}>
    <div className="container pb-[clamp(4rem,8vw,7rem)] pt-[clamp(1.5rem,5vw,4.5rem)]">
      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-12">
        <aside
          aria-label="Phulhaar Gallery by PJK"
          className="flex items-center justify-center gap-5 sm:gap-8 lg:sticky lg:top-24 lg:col-span-4 lg:flex-col lg:gap-0 lg:self-start lg:pt-4 lg:text-center"
        >
          {/* Clear space of at least a lotus's height on every side (rule 4); on a phone the
              garland is small, beside the wordmark, so the form starts on the first screen */}
          <div className="shrink-0 p-2 lg:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="garland-breathe h-auto w-[7.5rem] lg:w-56 xl:w-64"
              height={1200}
              src="/brand/ventures/phulhaar-garland.webp"
              width={795}
            />
          </div>
          <div className="flex flex-col items-start lg:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Phulhaar"
              className="h-auto w-[9.5rem] sm:w-44 lg:mt-2 lg:w-48"
              height={60}
              src="/brand/ventures/phulhaar-wordmark.svg"
              width={240}
            />
            <p className="label mt-3 lg:mt-4" style={{ color: 'var(--gold-text)' }}>
              Gallery by PJK
            </p>
          </div>
        </aside>

        <div className="min-w-0 lg:col-span-8">
          <p className="label">{label}</p>
          <Heading className="display-lg mt-3 max-w-[18ch]" text={heading} />
          <div className="lede measure mt-6">{intro}</div>
          <div className="mt-14">{children}</div>
        </div>
      </div>
    </div>
  </div>
)
