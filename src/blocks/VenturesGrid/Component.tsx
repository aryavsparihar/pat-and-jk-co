import type { Venture, VenturesGridBlock as VenturesGridBlockProps } from '@/payload-types'

import { VentureCard } from '@/components/cards/VentureCard'
import { Reveal } from '@/components/Reveal'
import { SectionHeader } from '@/components/Typography'
import { getVentures } from '@/utilities/queries'
import { cn } from '@/utilities/ui'
import React from 'react'

import type { BlockContext } from '../types'

export const VenturesGridBlock = async ({
  eyebrow,
  heading,
  intro,
  populateBy,
  ventures: selected,
  ctx,
}: VenturesGridBlockProps & { ctx: BlockContext }) => {
  const ventures: Venture[] =
    populateBy === 'selection'
      ? (selected ?? []).filter((v): v is Venture => typeof v === 'object')
      : await getVentures(ctx.tenantId, ctx.draft)

  if (ventures.length === 0) return null

  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <SectionHeader className="mb-16" eyebrow={eyebrow} heading={heading} intro={intro} />
        </Reveal>
        <div
          className={cn(
            'grid gap-x-10 gap-y-16 md:grid-cols-2',
            ventures.length > 2 && 'lg:grid-cols-3',
          )}
        >
          {ventures.map((venture, i) => (
            <Reveal delay={i * 100} key={venture.id}>
              <VentureCard venture={venture} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
