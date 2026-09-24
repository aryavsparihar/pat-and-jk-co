import type { VentureSpotlightBlock as VentureSpotlightBlockProps } from '@/payload-types'

import { ventureMotif, ventureStageLabel } from '@/components/cards/VentureCard'
import { Media } from '@/components/Media'
import { Plate } from '@/components/Plate'
import { Section } from '@/components/Typography'
import { docPath } from '@/utilities/docHref'
import Link from 'next/link'
import React from 'react'

/**
 * One venture presented in detail. Without a cover photograph it shows the venture's own mark
 * on paper, and without either of those a green title plate.
 */
export const VentureSpotlightBlock: React.FC<VentureSpotlightBlockProps> = ({
  eyebrow,
  venture,
  linkLabel,
}) => {
  if (!venture || typeof venture !== 'object') return null

  const cover = venture.cover && typeof venture.cover === 'object' ? venture.cover : null
  const logo = venture.logo && typeof venture.logo === 'object' ? venture.logo : null
  const motif = ventureMotif(venture.name)
  const href = venture.stage === 'coming-soon' ? null : docPath('ventures', venture.slug)

  return (
    <Section label={eyebrow || ventureStageLabel[venture.stage]}>
      <div className="grid items-end gap-x-12 gap-y-10 lg:grid-cols-9">
        <div className="relative aspect-[4/3] w-full overflow-hidden lg:col-span-4 lg:aspect-[4/5]">
          {cover ? (
            <Media
              fill
              imgClassName="object-cover"
              resource={cover}
              size="(max-width: 1024px) 100vw, 35vw"
            />
          ) : (
            <Plate
              mark={logo}
              markSize="(max-width: 1024px) 100vw, 35vw"
              size="lg"
              subtitle={motif.subtitle}
              title={motif.title}
            />
          )}
        </div>

        <div className="lg:col-span-5">
          <h2 className="display-lg">{venture.name}</h2>
          {venture.tagline && (
            <p className="mt-3 font-display text-[1.45rem] italic text-primary">
              {venture.tagline}
            </p>
          )}
          {venture.summary && <p className="measure mt-7">{venture.summary}</p>}
          {href && (
            <Link className="btn btn-solid mt-9" href={href}>
              {linkLabel || `About ${motif.title}`}
            </Link>
          )}
        </div>
      </div>
    </Section>
  )
}
