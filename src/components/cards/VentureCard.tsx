import type { Venture } from '@/payload-types'

import { docPath } from '@/utilities/docHref'
import { cn } from '@/utilities/ui'
import Link from 'next/link'
import React from 'react'

import { Media } from '../Media'
import { MotifPanel } from '../MotifPanel'

export const ventureStatusLabel: Record<Venture['stage'], string> = {
  flagship: 'Flagship',
  live: 'Active',
  'coming-soon': 'Coming soon',
}

/** Splits "Phulhaar Gallery by PJK" into title + subtitle for the typographic panel. */
export const ventureMotif = (name: string) => {
  const match = name.match(/^(.*?)\s+(by\s+.+)$/i)
  return match ? { title: match[1], subtitle: match[2] } : { title: name, subtitle: null }
}

export const VentureCard: React.FC<{ venture: Venture; className?: string }> = ({
  venture,
  className,
}) => {
  const comingSoon = venture.stage === 'coming-soon'
  const motif = ventureMotif(venture.name)
  const cover = venture.cover && typeof venture.cover === 'object' ? venture.cover : null

  const body = (
    <>
      <div className="zoom-media relative aspect-[4/3] overflow-hidden">
        {cover ? (
          <Media
            fill
            imgClassName="object-cover"
            resource={cover}
            size="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <MotifPanel dashed={comingSoon} size="sm" subtitle={motif.subtitle} title={motif.title} />
        )}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <span className="eyebrow">{ventureStatusLabel[venture.stage]}</span>
        {venture.sector && (
          <>
            <span aria-hidden className="h-px w-5 bg-border-strong" />
            <span className="eyebrow">{venture.sector}</span>
          </>
        )}
      </div>
      <h3 className="display-sm mt-3">{venture.name}</h3>
      {(venture.tagline || venture.summary) && (
        <p className="mt-3 text-[0.95rem] leading-relaxed text-muted-foreground">
          {venture.tagline || venture.summary}
        </p>
      )}
      {!comingSoon && (
        <span className="btn-text mt-5">
          Discover{' '}
          <span aria-hidden className="arrow">
            →
          </span>
        </span>
      )}
    </>
  )

  if (comingSoon) {
    return <div className={cn('group block', className)}>{body}</div>
  }

  return (
    <Link className={cn('group block', className)} href={docPath('ventures', venture.slug)}>
      {body}
    </Link>
  )
}
