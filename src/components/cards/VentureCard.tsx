import type { Venture } from '@/payload-types'

import { isOpeningAhead, OpeningNotice } from '@/components/OpeningNotice'
import { docPath } from '@/utilities/docHref'
import { cn } from '@/utilities/ui'
import Link from 'next/link'
import React from 'react'

export const ventureStageLabel: Record<Venture['stage'], string> = {
  flagship: 'Flagship',
  live: 'Active',
  'coming-soon': 'In preparation',
}

/** Splits "Phulhaar Gallery by PJK" into title + subtitle for typographic plates. */
export const ventureMotif = (name: string) => {
  const match = name.match(/^(.*?)\s+(by\s+.+)$/i)
  return match ? { title: match[1]!, subtitle: match[2]! } : { title: name, subtitle: null }
}

/**
 * A hairline arrow, the same weight as the rules it sits between. The right padding is the
 * room it travels on hover, so it lands flush with the rule instead of crossing it.
 */
const Arrow: React.FC = () => (
  <svg
    aria-hidden
    className="row-arrow w-[1.9rem] shrink-0 pr-[0.3rem]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    viewBox="0 0 26 8"
  >
    <path d="M0 4h23.5M20 1l3.5 3-3.5 3" />
  </svg>
)

/** One row of the ventures index: number, name and description, stage. */
export const VentureRow: React.FC<{ venture: Venture; index: number }> = ({ venture, index }) => {
  const inPreparation = venture.stage === 'coming-soon'
  // A venture with a date ahead of it is the one to look at, so it sits on paper
  const opening = isOpeningAhead(venture.opening)

  const content = (
    <>
      <span className="label pt-1">{String(index + 1).padStart(2, '0')}</span>
      <span className="min-w-0">
        <span
          className={cn('display-sm block', inPreparation ? '!text-muted-foreground' : 'row-title')}
        >
          {venture.name}
        </span>
        {(venture.tagline || venture.summary) && (
          <span className="muted mt-1.5 block">{venture.tagline || venture.summary}</span>
        )}
        <OpeningNotice className="mt-2 !text-primary" opening={venture.opening} />
      </span>
      <span className="label col-start-2 flex items-center gap-4 sm:col-start-auto sm:justify-end sm:pt-1">
        {ventureStageLabel[venture.stage]}
        {!inPreparation && <Arrow />}
      </span>
    </>
  )

  const rowClass = cn(
    'grid grid-cols-[2.5rem_1fr] items-baseline gap-x-6 gap-y-2 py-7',
    'sm:grid-cols-[3.5rem_1fr_auto]',
    // Any ground stays flush with the rules above and below, so the index stays an index
    opening && 'bg-surface',
  )

  return (
    <li className="border-b border-border">
      {inPreparation ? (
        <div className={rowClass}>{content}</div>
      ) : (
        <Link
          className={cn(rowClass, 'row-link transition-colors hover:bg-surface')}
          href={docPath('ventures', venture.slug)}
        >
          {content}
        </Link>
      )}
    </li>
  )
}
