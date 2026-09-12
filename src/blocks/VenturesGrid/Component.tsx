import type { Venture, VenturesGridBlock as VenturesGridBlockProps } from '@/payload-types'

import { VentureRow } from '@/components/cards/VentureCard'
import { Section, SectionHeading } from '@/components/Typography'
import { getVentures } from '@/utilities/queries'
import React from 'react'

import type { BlockContext } from '../types'

/** The group's ventures as a numbered index, like the contents page of a catalogue. */
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
    <Section label={eyebrow}>
      <SectionHeading heading={heading} intro={intro} />
      <ol className="border-t border-border-strong">
        {ventures.map((venture, i) => (
          <VentureRow index={i} key={venture.id} venture={venture} />
        ))}
      </ol>
    </Section>
  )
}
