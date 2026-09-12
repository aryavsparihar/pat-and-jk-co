import type { HeroBlock as HeroBlockProps } from '@/payload-types'

import { BrandLogo } from '@/components/BrandLogo'
import { CMSLink } from '@/components/Link'
import { Emphasis, Eyebrow, Ornament } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

import type { BlockContext } from '../types'

export const HeroBlock: React.FC<HeroBlockProps & { ctx: BlockContext }> = ({
  variant,
  eyebrow,
  heading,
  subheading,
  links,
  showOrnament,
  ctx,
}) => {
  const isBrand = variant === 'brand'
  const HeadingTag = ctx.isFirst ? 'h1' : 'h2'

  return (
    <section
      className={cn(
        'relative overflow-hidden',
        isBrand ? 'pb-[clamp(4.5rem,9vw,8rem)] pt-[clamp(3.5rem,8vw,7rem)]' : 'section',
      )}
    >
      {/* A barely-there wash of paper tone behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80%] bg-[radial-gradient(ellipse_at_top,var(--surface),transparent_70%)]"
      />

      <div className="container flex flex-col items-center text-center">
        {isBrand && (
          <div className="animate-rise w-[clamp(15rem,40vw,30rem)]">
            <BrandLogo className="w-full text-primary" priority settings={ctx.settings} />
          </div>
        )}

        {!isBrand && showOrnament && <Ornament className="animate-rise mb-8 text-primary" />}

        <Eyebrow className={cn('animate-rise [animation-delay:120ms]', isBrand ? 'mt-14' : 'mb-6')}>
          {eyebrow}
        </Eyebrow>

        <HeadingTag
          className={cn(
            'animate-rise max-w-[20ch] [animation-delay:180ms]',
            isBrand ? 'display-lg mt-5' : 'display-xl',
          )}
        >
          <Emphasis text={heading} />
        </HeadingTag>

        {subheading && (
          <p className="lede animate-rise mt-7 max-w-[40rem] [animation-delay:260ms]">
            {subheading}
          </p>
        )}

        {links && links.length > 0 && (
          <div className="animate-rise mt-10 flex flex-wrap items-center justify-center gap-4 [animation-delay:340ms]">
            {links.map(({ link }, i) => (
              <CMSLink key={i} {...link} />
            ))}
          </div>
        )}

        {isBrand && showOrnament && (
          <Ornament
            className="animate-rise mt-16 w-full max-w-md text-primary [animation-delay:420ms]"
            rule
          />
        )}
      </div>
    </section>
  )
}
