import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'
import { Reveal } from '@/components/Reveal'

import type { ContentBlock as ContentBlockProps } from '@/payload-types'

import { CMSLink } from '../../components/Link'

const colSpan = {
  full: 'lg:col-span-12',
  half: 'lg:col-span-6',
  oneThird: 'lg:col-span-4',
  twoThirds: 'lg:col-span-8',
}

export const ContentBlock: React.FC<ContentBlockProps> = ({ columns, width }) => {
  if (!columns?.length) return null

  return (
    <section className="section-tight">
      <div className={width === 'wide' ? 'container' : 'container-narrow'}>
        <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-12">
          {columns.map((col, index) => {
            const { enableLink, link, richText, size } = col
            return (
              <Reveal
                className={cn(
                  'col-span-1',
                  width === 'wide' ? colSpan[size ?? 'full'] : 'lg:col-span-12',
                )}
                delay={index * 90}
                key={col.id ?? index}
              >
                {richText && <RichText className="rt-lg" data={richText} />}
                {enableLink && link && (
                  <div className="mt-8">
                    <CMSLink {...link} />
                  </div>
                )}
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
