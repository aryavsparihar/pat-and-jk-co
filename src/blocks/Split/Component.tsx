import type { SplitBlock as SplitBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Media } from '@/components/Media'
import { MotifPanel } from '@/components/MotifPanel'
import RichText from '@/components/RichText'
import { Reveal } from '@/components/Reveal'
import { Emphasis, Eyebrow } from '@/components/Typography'
import { cn } from '@/utilities/ui'
import React from 'react'

import type { BlockContext } from '../types'

export const SplitBlock: React.FC<SplitBlockProps & { ctx: BlockContext }> = ({
  eyebrow,
  heading,
  content,
  media,
  mediaPosition,
  background,
  enableLink,
  link,
  ctx,
}) => {
  const mediaLeft = mediaPosition === 'left'
  const image = media && typeof media === 'object' ? media : null

  return (
    <section className={cn('section', background === 'surface' && 'bg-surface')}>
      <div className="container grid items-center gap-x-20 gap-y-12 lg:grid-cols-2">
        <Reveal
          className={cn(
            'relative aspect-[4/5] w-full overflow-hidden',
            mediaLeft ? 'lg:order-1' : 'lg:order-2',
          )}
        >
          {image ? (
            <Media
              fill
              imgClassName="object-cover"
              resource={image}
              size="(max-width: 1024px) 100vw, 50vw"
            />
          ) : (
            <MotifPanel
              className={cn(background === 'surface' && 'bg-background')}
              size="md"
              subtitle={ctx.settings?.siteName}
            />
          )}
        </Reveal>
        <Reveal className={cn(mediaLeft ? 'lg:order-2' : 'lg:order-1')} delay={120}>
          <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
          <h2 className="display-lg">
            <Emphasis text={heading} />
          </h2>
          {content && <RichText className="rt-lg mt-8" data={content} />}
          {enableLink && link && (
            <div className="mt-10">
              <CMSLink {...link} />
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}
