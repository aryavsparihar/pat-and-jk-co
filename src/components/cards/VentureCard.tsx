import type { Venture } from '@/payload-types'

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

/** One row of the ventures index: number, name and description, stage. */
export const VentureRow: React.FC<{ venture: Venture; index: number }> = ({ venture, index }) => {
  const inPreparation = venture.stage === 'coming-soon'

  const content = (
    <>
      <span className="label pt-1">{String(index + 1).padStart(2, '0')}</span>
      <span className="min-w-0">
        <span
          className={cn(
            'display-sm block',
            inPreparation && '!text-muted-foreground',
            !inPreparation && 'decoration-1 underline-offset-[0.2em] group-hover:underline',
          )}
        >
          {venture.name}
        </span>
        {(venture.tagline || venture.summary) && (
          <span className="muted mt-1.5 block">{venture.tagline || venture.summary}</span>
        )}
      </span>
      <span className="label col-start-2 sm:col-start-auto sm:pt-1 sm:text-right">
        {ventureStageLabel[venture.stage]}
      </span>
    </>
  )

  const rowClass =
    'grid grid-cols-[2.5rem_1fr] items-baseline gap-x-6 gap-y-2 py-7 sm:grid-cols-[3.5rem_1fr_auto]'

  return (
    <li className="border-b border-border">
      {inPreparation ? (
        <div className={rowClass}>{content}</div>
      ) : (
        <Link className={cn(rowClass, 'group')} href={docPath('ventures', venture.slug)}>
          {content}
        </Link>
      )}
    </li>
  )
}
