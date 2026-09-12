import type { QuoteBlock as QuoteBlockProps } from '@/payload-types'

import { Reveal } from '@/components/Reveal'
import { Ornament } from '@/components/Typography'
import React from 'react'

export const QuoteBlock: React.FC<QuoteBlockProps> = ({ quote, attribution, role }) => (
  <section className="section">
    <Reveal className="container flex flex-col items-center text-center">
      <Ornament className="mb-10 text-primary" />
      <figure className="max-w-4xl">
        <blockquote className="font-serif text-[clamp(1.75rem,3.4vw,2.9rem)] font-normal italic leading-[1.25] text-foreground">
          <p>&ldquo;{quote}&rdquo;</p>
        </blockquote>
        {(attribution || role) && (
          <figcaption className="mt-10">
            {attribution && <p className="font-serif text-xl">{attribution}</p>}
            {role && <p className="eyebrow mt-2">{role}</p>}
          </figcaption>
        )}
      </figure>
    </Reveal>
  </section>
)
