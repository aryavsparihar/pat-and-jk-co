import { cn } from '@/utilities/ui'
import React from 'react'

import { FOUNDER_NAME, FOUNDER_TITLES } from './founder'

/** His name, then both titles on two lines, under the signature */
export const FounderCredit: React.FC<{ className?: string; titleSize?: string }> = ({
  className,
  titleSize = 'text-base',
}) => (
  <div className={className}>
    <p className="m-0 text-lg font-medium">{FOUNDER_NAME}</p>
    <p className={cn('house-note m-0 mt-0.5 leading-[1.55]', titleSize)}>
      {FOUNDER_TITLES[0]}
      <br />
      {FOUNDER_TITLES[1]}
    </p>
  </div>
)
