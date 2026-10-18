import type { Venture } from '@/payload-types'

import { ventureTheme } from '@/brands/themes'
import { isOpeningAhead, OpeningNotice } from '@/components/OpeningNotice'
import { RowArrow } from '@/components/RowArrow'
import { docPath } from '@/utilities/docHref'
import { cn } from '@/utilities/ui'
import Link from '@/components/IntentLink'
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
 * One row of the ventures index: number, name and description, stage. A venture with its own
 * theme (Ventures → Theme) is a doorway into it: its row is set in the brand's ground, type and
 * colours, with its mark, while the rest of the index stays in PJK's style.
 */
export const VentureRow: React.FC<{ venture: Venture; index: number }> = ({ venture, index }) => {
  const inPreparation = venture.stage === 'coming-soon'
  // A venture with a date ahead of it is the one to look at, so it sits on paper
  const opening = isOpeningAhead(venture.opening)
  const theme = ventureTheme(venture)

  const content = (
    <>
      <span className={cn('label pt-1', theme && 'text-[var(--accent)]')}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="min-w-0">
        <span
          className={cn('display-sm block', inPreparation ? '!text-muted-foreground' : 'row-title')}
        >
          {venture.name}
        </span>
        {(venture.tagline || venture.summary) && (
          <span className="muted mt-1.5 block">{venture.tagline || venture.summary}</span>
        )}
        <OpeningNotice
          className={cn(
            'mt-2',
            theme ? '!text-[var(--gold-text,var(--primary))]' : '!text-primary',
          )}
          opening={venture.opening}
        />
      </span>
      <span
        className={cn(
          'label col-start-2 flex items-center gap-4 sm:col-start-auto sm:justify-end sm:pt-1',
          // With a mark beside it, the column is centred on the row rather than its first line
          theme?.emblem && 'sm:self-center sm:pt-0',
        )}
      >
        {theme?.emblem && (
          // The brand's own mark, on the ground it is drawn for; decorative beside the name
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="h-auto w-11 shrink-0 sm:w-12"
            height={theme.emblem.height}
            loading="lazy"
            src={theme.emblem.src}
            width={theme.emblem.width}
          />
        )}
        {ventureStageLabel[venture.stage]}
        {!inPreparation && <RowArrow />}
      </span>
    </>
  )

  const rowClass = cn(
    'grid grid-cols-[2.5rem_1fr] items-baseline gap-x-6 gap-y-2 py-7',
    'sm:grid-cols-[3.5rem_1fr_auto]',
    // Any ground stays flush with the rules above and below, so the index stays an index
    opening && !theme && 'bg-surface',
    // A theme's ground reaches a little past the text, which stays aligned with the other rows
    theme && '-mx-4 bg-[var(--background)] px-4 sm:-mx-6 sm:px-6',
  )

  return (
    <li
      className={cn('border-b border-border', theme?.className, theme && 'relative')}
      data-display={theme?.display}
    >
      {theme?.ruleClassName && (
        <span
          aria-hidden
          className={cn(theme.ruleClassName, 'absolute inset-x-0 -top-px z-10 -mx-4 sm:-mx-6')}
        />
      )}
      {inPreparation ? (
        <div className={rowClass}>{content}</div>
      ) : (
        <Link
          // A theme keeps its own ground on hover: its colours are measured against that ground
          className={cn(rowClass, 'row-link transition-colors', !theme && 'hover:bg-surface')}
          href={docPath('ventures', venture.slug)}
        >
          {content}
        </Link>
      )}
    </li>
  )
}
