import type { Media, SiteSetting } from '@/payload-types'

import { getMediaUrl } from '@/utilities/getMediaUrl'
import { cn } from '@/utilities/ui'
import React from 'react'

type Props = {
  settings: SiteSetting | null
  /** Which artwork to prefer */
  variant?: 'full' | 'compact' | 'onDark'
  className?: string
  priority?: boolean
}

const asMedia = (value: unknown): Media | null =>
  value && typeof value === 'object' && 'url' in value ? (value as Media) : null

/**
 * The brand's logo from Site settings → Brand. Falls back to the site name set in serif,
 * so a brand that hasn't uploaded a logo yet still looks finished.
 */
export const BrandLogo: React.FC<Props> = ({ settings, variant = 'full', className, priority }) => {
  const name = settings?.siteName || 'PAT and J.K. Co.'

  const media =
    variant === 'onDark'
      ? asMedia(settings?.logoOnDark)
      : variant === 'compact'
        ? asMedia(settings?.wordmark) || asMedia(settings?.logo)
        : asMedia(settings?.logo)

  if (media?.url) {
    return (
      // Plain <img>: logos are usually SVG, which next/image does not optimise
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={name}
        className={cn('block h-auto', className)}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        height={media.height ?? undefined}
        src={getMediaUrl(media.url, media.updatedAt)}
        width={media.width ?? undefined}
      />
    )
  }

  return (
    <span className={cn('font-serif text-2xl leading-none tracking-wide', className)}>
      {settings?.shortName || name}
    </span>
  )
}
