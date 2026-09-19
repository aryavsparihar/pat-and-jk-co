import type { HeroBlock as HeroBlockProps } from '@/payload-types'

import { BrandLogo } from '@/components/BrandLogo'
import { CMSLink } from '@/components/Link'
import { Emphasis, Label } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

import type { BlockContext } from '../types'

/**
 * Opening of a page. "Brand" sets the logo large, like a letterhead, above the statement;
 * "Statement" is a large heading on its own.
 */
export const HeroBlock: React.FC<HeroBlockProps & { ctx: BlockContext }> = ({
  variant,
  eyebrow,
  heading,
  subheading,
  links,
  ctx,
}) => {
  const isBrand = variant === 'brand'
  const HeadingTag = ctx.isFirst ? 'h1' : 'h2'

  // The opening sequence only runs for the brand hero (the homepage letterhead)
  const intro = (delay: string) =>
    isBrand
      ? { className: 'intro-line', style: { '--intro-delay': delay } as React.CSSProperties }
      : {}

  return (
    <section className="pb-[clamp(4rem,8vw,7rem)]">
      <div className="container">
        {isBrand && (
          <div className="flex justify-center pb-[clamp(3rem,7vw,5.5rem)] pt-[clamp(3.5rem,9vw,7.5rem)]">
            <div className="intro-mark w-[clamp(15rem,34vw,27rem)]">
              <BrandLogo className="w-full text-primary" priority settings={ctx.settings} />
            </div>
          </div>
        )}

        {isBrand && <div aria-hidden className="intro-rule h-px w-full bg-border" />}

        <div
          className={cn(
            'grid gap-x-12 gap-y-5 lg:grid-cols-12',
            isBrand
              ? 'pt-[clamp(2.25rem,4vw,3.25rem)]'
              : 'section-rule-none pt-[clamp(4rem,9vw,7.5rem)]',
          )}
        >
          <div className="lg:col-span-3">
            <Label {...intro('0.85s')}>{eyebrow}</Label>
          </div>
          <div className="lg:col-span-9">
            <HeadingTag
              {...intro('0.95s')}
              className={cn(
                isBrand ? 'display-lg max-w-[20ch]' : 'display-xl max-w-[16ch]',
                isBrand && 'intro-line',
              )}
            >
              <Emphasis text={heading} />
            </HeadingTag>
            {subheading && (
              <p {...intro('1.05s')} className={cn('lede measure mt-7', isBrand && 'intro-line')}>
                {subheading}
              </p>
            )}
            {links && links.length > 0 && (
              <div
                {...intro('1.15s')}
                className={cn(
                  'mt-9 flex flex-wrap items-center gap-x-8 gap-y-4',
                  isBrand && 'intro-line',
                )}
              >
                {links.map(({ link }, i) => (
                  <CMSLink key={i} {...link} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
