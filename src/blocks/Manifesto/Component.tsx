import type { ManifestoBlock as ManifestoBlockProps } from '@/payload-types'

import RichText from '@/components/RichText'
import { Heading, Section } from '@/components/Typography'
import React from 'react'

/**
 * A statement. "Split" sets the heading against the text like a letterhead; "centred" reads as an
 * interlude between two sections — heading over a narrow column, the text itself still ranged left.
 */
export const ManifestoBlock: React.FC<ManifestoBlockProps> = ({
  eyebrow,
  heading,
  content,
  layout,
}) =>
  layout === 'centered' ? (
    <Section label={eyebrow}>
      <div className="mx-auto max-w-[46rem]">
        <Heading className="display-md text-center text-balance" text={heading} />
        <RichText className="rt-lead mt-8" data={content} />
      </div>
    </Section>
  ) : (
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
