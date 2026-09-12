import type { ManifestoBlock as ManifestoBlockProps } from '@/payload-types'

import RichText from '@/components/RichText'
import { Reveal } from '@/components/Reveal'
import { Emphasis, Eyebrow } from '@/components/Typography'
import React from 'react'

export const ManifestoBlock: React.FC<ManifestoBlockProps> = ({
  eyebrow,
  heading,
  content,
  layout,
}) => {
  if (layout === 'centered') {
    return (
      <section className="section">
        <Reveal className="container-narrow text-center">
          <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
          <h2 className="display-lg">
            <Emphasis text={heading} />
          </h2>
          <RichText className="rt-lg rt-lead mt-10 text-left md:text-center" data={content} />
        </Reveal>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="container grid gap-x-16 gap-y-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <div className="lg:sticky lg:top-32">
            <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
            <h2 className="display-lg">
              <Emphasis text={heading} />
            </h2>
          </div>
        </Reveal>
        <Reveal className="lg:col-span-6 lg:col-start-7" delay={120}>
          <div className="border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <RichText className="rt-lg rt-lead" data={content} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
