import type { QuoteBlock as QuoteBlockProps } from '@/payload-types'

import { Section } from '@/components/Typography'
import React from 'react'

export const QuoteBlock: React.FC<QuoteBlockProps> = ({ quote, attribution, role }) => (
  <Section>
    <figure className="max-w-4xl">
      <blockquote className="font-display text-[clamp(1.8rem,3.2vw,2.7rem)] italic leading-[1.22] text-primary">
        <p>&ldquo;{quote}&rdquo;</p>
      </blockquote>
      {(attribution || role) && (
        <figcaption className="mt-7">
          {attribution && <span>{attribution}</span>}
          {attribution && role && <span className="muted">, </span>}
          {role && <span className="muted italic">{role}</span>}
        </figcaption>
      )}
    </figure>
  </Section>
)
