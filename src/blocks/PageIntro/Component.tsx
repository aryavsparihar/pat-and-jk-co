import type { PageIntroBlock as PageIntroBlockProps } from '@/payload-types'

import { Emphasis, Label } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

import type { BlockContext } from '../types'

/** The title of an inner page: page name in the margin, a large heading and an introduction. */
export const PageIntroBlock: React.FC<PageIntroBlockProps & { ctx: BlockContext }> = ({
  eyebrow,
  heading,
  intro,
  align,
  ctx,
}) => {
  const HeadingTag = ctx.isFirst ? 'h1' : 'h2'
  const centered = align === 'center'

  return (
    <section className="pb-[clamp(3.5rem,7vw,6rem)] pt-[clamp(4rem,9vw,7.5rem)]">
      <div
        className={cn(
          'container',
          centered ? 'text-center' : 'grid gap-x-12 gap-y-5 lg:grid-cols-12',
        )}
      >
        <div className={cn(!centered && 'lg:col-span-3 lg:pt-4')}>
          <Label className={cn(centered && 'mb-6')}>{eyebrow}</Label>
        </div>
        <div className={cn(!centered && 'lg:col-span-9')}>
          <HeadingTag className={cn('display-xl max-w-[16ch]', centered && 'mx-auto')}>
            <Emphasis text={heading} />
          </HeadingTag>
          {intro && <p className={cn('lede measure mt-8', centered && 'mx-auto')}>{intro}</p>}
        </div>
      </div>
    </section>
  )
}
