import type { VentureSpotlightBlock as VentureSpotlightBlockProps } from '@/payload-types'

import { ventureMotif, ventureStatusLabel } from '@/components/cards/VentureCard'
import { Media } from '@/components/Media'
import { MotifPanel } from '@/components/MotifPanel'
import { Reveal } from '@/components/Reveal'
import { Eyebrow } from '@/components/Typography'
import { docPath } from '@/utilities/docHref'
import Link from 'next/link'
import React from 'react'

export const VentureSpotlightBlock: React.FC<VentureSpotlightBlockProps> = ({
  eyebrow,
  venture,
  linkLabel,
}) => {
  if (!venture || typeof venture !== 'object') return null

  const cover = venture.cover && typeof venture.cover === 'object' ? venture.cover : null
  const motif = ventureMotif(venture.name)
  const href = venture.stage === 'coming-soon' ? null : docPath('ventures', venture.slug)

  return (
    <section className="section bg-surface">
      <div className="container grid items-center gap-x-20 gap-y-12 lg:grid-cols-12">
        <Reveal className="relative aspect-[4/3] w-full overflow-hidden lg:col-span-7">
          {cover ? (
            <Media
              fill
              imgClassName="object-cover"
              resource={cover}
              size="(max-width: 1024px) 100vw, 58vw"
            />
          ) : (
            <MotifPanel
              className="bg-background"
              size="lg"
              subtitle={motif.subtitle}
              title={motif.title}
            />
          )}
        </Reveal>

        <Reveal className="lg:col-span-5" delay={120}>
          <Eyebrow className="mb-5">{eyebrow || ventureStatusLabel[venture.stage]}</Eyebrow>
          <h2 className="display-lg">{venture.name}</h2>
          {venture.tagline && (
            <p className="mt-4 font-serif text-[1.4rem] italic leading-snug text-primary">
              {venture.tagline}
            </p>
          )}
          {venture.summary && <p className="lede mt-7">{venture.summary}</p>}
          {href && (
            <Link className="btn btn-solid mt-10" href={href}>
              {linkLabel || `Discover ${motif.title}`}
              <span aria-hidden className="arrow">
                →
              </span>
            </Link>
          )}
        </Reveal>
      </div>
    </section>
  )
}
