import type { CtaBandBlock as CtaBandBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Reveal } from '@/components/Reveal'
import { Emphasis, Eyebrow, Ornament } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

export const CtaBandBlock: React.FC<CtaBandBlockProps> = ({
  eyebrow,
  heading,
  text,
  links,
  tone,
}) => {
  const onPrimary = tone !== 'surface'

  return (
    <section className={cn('section', onPrimary ? 'on-dark bg-primary' : 'bg-surface')}>
      <Reveal className="container flex flex-col items-center text-center">
        <Ornament className={cn('mb-9', onPrimary ? 'text-background/70' : 'text-primary')} />
        <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
        <h2 className="display-lg max-w-[22ch]">
          <Emphasis text={heading} />
        </h2>
        {text && <p className="lede mx-auto mt-6 max-w-2xl">{text}</p>}
        {links && links.length > 0 && (
          <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
            {links.map(({ link }, i) => (
              <CMSLink key={i} {...link} />
            ))}
          </div>
        )}
      </Reveal>
    </section>
  )
}
