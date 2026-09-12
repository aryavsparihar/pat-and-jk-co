import type { PageIntroBlock as PageIntroBlockProps } from '@/payload-types'

import { Emphasis, Eyebrow, Ornament } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

import type { BlockContext } from '../types'

export const PageIntroBlock: React.FC<PageIntroBlockProps & { ctx: BlockContext }> = ({
  eyebrow,
  heading,
  intro,
  align,
  ctx,
}) => {
  const centered = align !== 'left'
  const HeadingTag = ctx.isFirst ? 'h1' : 'h2'

  return (
    <section className="pb-[clamp(3rem,6vw,5rem)] pt-[clamp(4rem,9vw,7.5rem)]">
      <div className={cn('container', centered && 'flex flex-col items-center text-center')}>
        <Eyebrow className="animate-rise mb-6">{eyebrow}</Eyebrow>
        <HeadingTag className="display-xl animate-rise max-w-[18ch] [animation-delay:100ms]">
          <Emphasis text={heading} />
        </HeadingTag>
        {intro && (
          <p
            className={cn(
              'lede animate-rise mt-8 max-w-[42rem] [animation-delay:200ms]',
              centered && 'mx-auto',
            )}
          >
            {intro}
          </p>
        )}
        <Ornament
          className={cn(
            'animate-rise mt-14 text-primary [animation-delay:300ms]',
            centered ? 'max-w-sm' : 'ml-0 max-w-xs',
          )}
          rule
        />
      </div>
    </section>
  )
}
