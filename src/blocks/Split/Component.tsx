import type { SplitBlock as SplitBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Media } from '@/components/Media'
import RichText from '@/components/RichText'
import { Heading, Section } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

/**
 * A photograph beside text. Until a photograph is uploaded, the heading and text simply sit
 * side by side, rather than showing an empty placeholder.
 */
export const SplitBlock: React.FC<SplitBlockProps> = ({
  eyebrow,
  heading,
  content,
  media,
  mediaPosition,
  enableLink,
  link,
}) => {
  const image = media && typeof media === 'object' ? media : null

  const text = (
    <>
      {content && <RichText data={content} />}
      {enableLink && link && (
        <div className="mt-8">
          <CMSLink {...link} />
        </div>
      )}
    </>
  )

  if (!image) {
    return (
      <Section label={eyebrow}>
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-9">
          <div className="lg:col-span-4">
            <Heading className="display-md max-w-[16ch]" text={heading} />
          </div>
          <div className="lg:col-span-5">{text}</div>
        </div>
      </Section>
    )
  }

  return (
    <Section label={eyebrow}>
      <div className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-9">
        <div
          className={cn(
            'relative aspect-[4/5] w-full overflow-hidden bg-surface lg:col-span-4',
            mediaPosition === 'right' && 'lg:order-2',
          )}
        >
          <Media
            fill
            imgClassName="object-cover"
            resource={image}
            size="(max-width: 1024px) 100vw, 35vw"
          />
        </div>
        <div className={cn('lg:col-span-5', mediaPosition === 'right' && 'lg:order-1')}>
          <Heading className="display-md max-w-[18ch]" text={heading} />
          <div className="mt-7">{text}</div>
        </div>
      </div>
    </Section>
  )
}
