import type { Venture } from '@/payload-types'

import { formatDate } from '@/utilities/formatDateTime'
import { cn } from '@/utilities/ui'
import React from 'react'

import { Ornament } from './Typography'

type Props = {
  opening: Venture['opening']
  className?: string
  /** `notice` is the announcement set under a venture's mark; `line` is one quiet line in a list */
  as?: 'notice' | 'line'
  /**
   * A venture theme's own rule (src/brands/themes.ts): the notice is then set in the theme, the
   * rule in place of the ornament, the date in its display face and the occasion in its accent
   */
  themeRule?: string
}

/**
 * "Opening 8 November 2026 — in celebration of Diwali", for a venture that has been announced
 * but has not opened yet. It takes itself down the day after, so nobody has to remember to.
 */
/**
 * Whether a venture is announced but not open yet. Compared by day, so an opening stands
 * until its own day is over.
 */
export const isOpeningAhead = (opening: Venture['opening']): boolean => {
  if (!opening?.date) return false
  const opensOn = new Date(opening.date)
  if (Number.isNaN(opensOn.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return opensOn >= today
}

export const OpeningNotice: React.FC<Props> = ({ opening, className, as = 'line', themeRule }) => {
  if (!isOpeningAhead(opening)) return null

  const date = opening!.date as string
  const when = formatDate(date)

  // A span, because a line often sits inside a link or a paragraph
  if (as === 'line') {
    return (
      <span className={cn('label block', className)}>
        Opening {when}
        {opening?.note ? ` — ${opening.note}` : ''}
      </span>
    )
  }

  if (themeRule) {
    return (
      <div className={cn('text-center', className)}>
        <span aria-hidden className={cn(themeRule, 'mx-auto block w-16')} />
        <p className="display-sm mt-5 text-primary">Opening {when}</p>
        {opening?.note && (
          <p className="mt-2 font-display text-[1.3rem] italic text-[var(--accent)]">
            {opening.note}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('text-center', className)}>
      <Ornament className="mx-auto w-16 opacity-60" />
      <p className="smallcaps mt-5 text-[1.1rem] text-primary">Opening {when}</p>
      {opening?.note && (
        <p className="mt-2 font-display text-[1.25rem] italic text-muted-foreground">
          {opening.note}
        </p>
      )}
    </div>
  )
}
