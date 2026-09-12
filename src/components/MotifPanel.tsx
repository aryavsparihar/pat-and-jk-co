import { cn } from '@/utilities/ui'
import React from 'react'

import { Ornament } from './Typography'

type Props = {
  className?: string
  /** Large serif line, e.g. a venture name or initials */
  title?: string | null
  /** Small spaced-caps line under the title, e.g. "by PJK" */
  subtitle?: string | null
  size?: 'sm' | 'md' | 'lg'
  dashed?: boolean
}

/**
 * The typographic stand-in used wherever a photograph hasn't been uploaded yet:
 * a framed paper panel with the leaf ornament — deliberate rather than "missing image".
 */
export const MotifPanel: React.FC<Props> = ({
  className,
  title,
  subtitle,
  size = 'md',
  dashed,
}) => (
  <div
    className={cn(
      'frame flex h-full w-full flex-col items-center justify-center px-6 text-center',
      dashed && 'border-dashed',
      className,
    )}
  >
    <Ornament className={cn('mb-5 text-primary/80', size === 'sm' ? 'w-16' : 'w-24')} />
    {title && (
      <p
        className={cn(
          'font-serif leading-[1.05] text-primary',
          size === 'lg' && 'text-[clamp(2.4rem,4.5vw,3.75rem)]',
          size === 'md' && 'text-[clamp(1.9rem,3vw,2.6rem)]',
          size === 'sm' && 'text-[1.75rem]',
        )}
      >
        {title}
      </p>
    )}
    {subtitle && <p className="eyebrow mt-4">{subtitle}</p>}
  </div>
)
