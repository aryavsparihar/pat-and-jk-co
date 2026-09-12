import type { BannerBlock as BannerBlockProps } from '@/payload-types'

import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'

type Props = {
  className?: string
} & BannerBlockProps

export const BannerBlock: React.FC<Props> = ({ className, content, style }) => {
  return (
    <div
      className={cn(
        'border-l-2 bg-surface px-6 py-4',
        {
          'border-primary': style === 'info' || style === 'success',
          'border-warning': style === 'warning',
          'border-destructive': style === 'error',
        },
        className,
      )}
    >
      <RichText data={content} />
    </div>
  )
}
