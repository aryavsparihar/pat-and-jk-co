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

  return (
    <section className="pb-[clamp(4rem,8vw,7rem)]">
      <div className="container">
        {isBrand && (
          <div className="flex justify-center pb-[clamp(3rem,7vw,5.5rem)] pt-[clamp(3.5rem,9vw,7.5rem)]">
            <BrandLogo
              className="w-[clamp(15rem,34vw,27rem)] text-primary"
              priority
              settings={ctx.settings}
            />
          </div>
        )}

        <div
          className={cn(
            'grid gap-x-12 gap-y-5 md:grid-cols-12',
            isBrand ? 'section-rule' : 'pt-[clamp(4rem,9vw,7.5rem)]',
          )}
        >
          <div className="md:col-span-3">
            <Label>{eyebrow}</Label>
          </div>
          <div className="md:col-span-9">
            <HeadingTag
              className={cn(isBrand ? 'display-lg max-w-[20ch]' : 'display-xl max-w-[16ch]')}
            >
              <Emphasis text={heading} />
            </HeadingTag>
            {subheading && <p className="lede measure mt-7">{subheading}</p>}
            {links && links.length > 0 && (
              <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
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
