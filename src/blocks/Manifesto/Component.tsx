import type { ManifestoBlock as ManifestoBlockProps } from '@/payload-types'

import RichText from '@/components/RichText'
import { Heading, Section } from '@/components/Typography'
import React from 'react'

export const ManifestoBlock: React.FC<ManifestoBlockProps> = ({ eyebrow, heading, content }) => (
  <Section label={eyebrow}>
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-9">
      <div className="lg:col-span-4">
        <Heading className="display-md max-w-[16ch]" text={heading} />
      </div>
      <div className="lg:col-span-5">
        <RichText className="rt-lead" data={content} />
      </div>
    </div>
  </Section>
)
