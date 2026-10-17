import type { Media, SiteSetting } from '@/payload-types'

import { BrandSvg } from '@/components/brand/BrandSvg'
import { brandSvgs } from '@/components/brand/svgs'
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

/** The uploaded PJK logo (pjk-logo.svg, pjk-logo-2.svg …), which also ships with the site */
const BUNDLED_LOGO = /^pjk-logo(-\d+)?\.svg$/

const [, , logoWidth, logoHeight] = brandSvgs.logo.viewBox.split(' ').map(Number)

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

  // The PJK logo is drawn inline from the copy in the code (src/components/brand/svgs.ts), so it
  // is on the page from the first paint: the homepage's opening wipe plays on the logo itself,
  // never on an empty box while the file is fetched, with its name standing in meanwhile
  if (variant === 'full' && BUNDLED_LOGO.test(media?.filename ?? '')) {
    return (
      <BrandSvg
        className={cn('block h-auto', className)}
        name="logo"
        style={{ aspectRatio: `${logoWidth} / ${logoHeight}` }}
        title={name}
      />
    )
  }

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
    <span className={cn('smallcaps text-[1.35rem] leading-none text-primary', className)}>
      {name}
    </span>
  )
}
