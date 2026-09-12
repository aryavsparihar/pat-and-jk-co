import type { StaticImageData } from 'next/image'

import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'

import type { MediaBlock as MediaBlockProps } from '@/payload-types'

import { Media } from '../../components/Media'
import { Reveal } from '../../components/Reveal'

type Props = MediaBlockProps & {
  captionClassName?: string
  className?: string
  enableGutter?: boolean
  imgClassName?: string
  staticImage?: StaticImageData
  disableInnerContainer?: boolean
}

export const MediaBlock: React.FC<Props> = (props) => {
  const { className, enableGutter = true, imgClassName, media, size, staticImage } = props

  const caption = media && typeof media === 'object' ? media.caption : undefined

  const figure = (
    <figure className={cn(className)}>
      {(media || staticImage) && (
        <Media
          className="overflow-hidden bg-surface"
          imgClassName={cn('h-auto w-full', imgClassName)}
          resource={media}
          size={size === 'wide' ? '100vw' : '(max-width: 1024px) 100vw, 1024px'}
          src={staticImage}
        />
      )}
      {caption && (
        <figcaption className="mt-4 text-sm text-muted-foreground">
          <RichText data={caption} />
        </figcaption>
      )}
    </figure>
  )

  if (!enableGutter) return figure

  return (
    <section className="section-tight">
      <Reveal className={cn('container', size !== 'wide' && 'max-w-5xl')}>{figure}</Reveal>
    </section>
  )
}
