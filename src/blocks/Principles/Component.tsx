import type { PrinciplesBlock as PrinciplesBlockProps } from '@/payload-types'

import { Section, SectionHeading } from '@/components/Typography'
import React from 'react'

const roman = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** A short list of principles or ways of working, set as ruled rows. */
export const PrinciplesBlock: React.FC<PrinciplesBlockProps> = ({
  eyebrow,
  heading,
  intro,
  items,
  numbering,
}) => {
  if (!items?.length) return null

  return (
    <Section label={eyebrow}>
      <SectionHeading heading={heading} intro={intro} />
      <ol className="border-t border-border-strong">
        {items.map((item, i) => (
          <li
            className="grid gap-x-12 gap-y-2 border-b border-border py-7 lg:grid-cols-9"
            key={item.id ?? i}
          >
            <h3 className="display-sm lg:col-span-3">
              {numbering !== 'none' && (
                <span className="mr-3 font-display font-normal italic text-muted-foreground">
                  {roman[i]}
                </span>
              )}
              {item.title}
            </h3>
            <p className="measure lg:col-span-6">{item.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
