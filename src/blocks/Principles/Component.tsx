import type { PrinciplesBlock as PrinciplesBlockProps } from '@/payload-types'

import { Reveal } from '@/components/Reveal'
import { SectionHeader } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

const roman = ['I', 'II', 'III', 'IV', 'V', 'VI']

export const PrinciplesBlock: React.FC<PrinciplesBlockProps> = ({
  eyebrow,
  heading,
  intro,
  items,
  numbering,
}) => {
  if (!items?.length) return null

  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <SectionHeader className="mb-16" eyebrow={eyebrow} heading={heading} intro={intro} />
        </Reveal>
        <ol
          className={cn(
            'grid gap-x-12 gap-y-14 md:grid-cols-2',
            items.length % 3 === 0 && 'lg:grid-cols-3',
            items.length === 4 && 'lg:grid-cols-4',
          )}
        >
          {items.map((item, i) => (
            <Reveal
              as="li"
              className="border-t border-border-strong pt-8"
              delay={i * 110}
              key={item.id ?? i}
            >
              {numbering !== 'none' && (
                <span className="font-serif text-[1.35rem] italic text-primary">{roman[i]}.</span>
              )}
              <h3 className="display-sm mt-3">{item.title}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">{item.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
