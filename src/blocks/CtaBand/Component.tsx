import type { CtaBandBlock as CtaBandBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Heading, Label, Section } from '@/components/Typography'
import React from 'react'

const Body: React.FC<Pick<CtaBandBlockProps, 'heading' | 'text' | 'links'>> = ({
  heading,
  text,
  links,
}) => (
  <>
    <Heading className="display-md max-w-[20ch]" text={heading} />
    {text && <p className="lede measure mt-5">{text}</p>}
    {links && links.length > 0 && (
      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
        {links.map(({ link }, i) => (
          <CMSLink key={i} {...link} />
        ))}
      </div>
    )}
  </>
)

/**
 * A closing invitation. "Paper tone" sits in the page like any other section;
 * "Brand colour band" is a full-width green panel — use it sparingly.
 */
export const CtaBandBlock: React.FC<CtaBandBlockProps> = ({
  eyebrow,
  heading,
  text,
  links,
  tone,
}) => {
  if (tone === 'primary') {
    return (
      <section className="on-dark bg-primary py-[clamp(4rem,8vw,6.5rem)]">
        <div className="container grid gap-x-12 gap-y-5 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Label>{eyebrow}</Label>
          </div>
          <div className="lg:col-span-9">
            <Body heading={heading} links={links} text={text} />
          </div>
        </div>
      </section>
    )
  }

  return (
    <Section label={eyebrow}>
      <Body heading={heading} links={links} text={text} />
    </Section>
  )
}
