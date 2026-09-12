import { cn } from '@/utilities/ui'
import React from 'react'

import { Ornament } from './Typography'

type Props = {
  className?: string
  /** Large serif line, e.g. a venture name or a monogram */
  title?: string | null
  /** Small-capitals line beneath, e.g. "by PJK" */
  subtitle?: string | null
  tone?: 'green' | 'paper'
  size?: 'md' | 'lg'
  ornament?: boolean
}

/**
 * A typographic plate, like the title page of a catalogue. Used deliberately where there is
 * no photograph (a venture without a cover, a person without a portrait) rather than an
 * empty "image goes here" box.
 */
export const Plate: React.FC<Props> = ({
  className,
  title,
  subtitle,
  tone = 'green',
  size = 'md',
  ornament = true,
}) => (
  <div className={cn('plate h-full w-full px-8', tone === 'paper' && 'plate-paper', className)}>
    {ornament && <Ornament className="mb-6 w-20 opacity-80" />}
    {title && (
      <p
        className={cn(
          'font-display leading-[1.02]',
          size === 'lg' ? 'text-[clamp(2.4rem,4.4vw,3.6rem)]' : 'text-[clamp(1.9rem,3vw,2.6rem)]',
        )}
      >
        {title}
      </p>
    )}
    {subtitle && <p className="smallcaps mt-4 text-[1.05rem] opacity-80">{subtitle}</p>}
  </div>
)
