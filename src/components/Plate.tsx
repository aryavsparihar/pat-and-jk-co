import type { Media as MediaType } from '@/payload-types'

import { cn } from '@/utilities/ui'
import React from 'react'

import { Media } from './Media'
import { Ornament } from './Typography'

type Props = {
  className?: string
  /** Large serif line, e.g. a venture name or a monogram */
  title?: string | null
  /** Small-capitals line beneath, e.g. "by PJK" */
  subtitle?: string | null
  /** A brand's own mark, shown in place of the lettering once one has been uploaded */
  mark?: MediaType | null
  tone?: 'green' | 'paper'
  size?: 'md' | 'lg'
  ornament?: boolean
  /** How wide the plate will be drawn, so the browser fetches the right rendition of the mark */
  markSize?: string
  /** Set on a plate above the fold, so the mark is not lazy-loaded */
  priority?: boolean
  /** Play the arrival animation. Only worth it where the plate opens a page. */
  animate?: boolean
}

/**
 * A typographic plate, like the title page of a catalogue. Used deliberately where there is
 * no photograph (a venture without a cover, a person without a portrait) rather than an
 * empty "image goes here" box.
 *
 * A venture that has its own mark shows it instead of the lettering, always on the paper tone:
 * a coloured logo does not survive being set on solid green.
 */
export const Plate: React.FC<Props> = ({
  className,
  title,
  subtitle,
  mark,
  tone = 'green',
  size = 'md',
  ornament = true,
  markSize = '(max-width: 1024px) 90vw, 32vw',
  priority,
  animate,
}) =>
  mark ? (
    <div className={cn('plate plate-paper h-full w-full', animate && 'plate-enter', className)}>
      <Media
        fill
        imgClassName={cn('object-contain p-[11%]', animate && 'mark-enter')}
        priority={priority}
        resource={mark}
        size={markSize}
      />
    </div>
  ) : (
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
