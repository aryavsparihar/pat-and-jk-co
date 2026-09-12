import { cn } from '@/utilities/ui'
import React from 'react'
import RichText from '@/components/RichText'
import { Section } from '@/components/Typography'

import type { ContentBlock as ContentBlockProps } from '@/payload-types'

import { CMSLink } from '../../components/Link'

const colSpan = {
  full: 'lg:col-span-9',
  half: 'lg:col-span-4',
  oneThird: 'lg:col-span-3',
  twoThirds: 'lg:col-span-6',
}

/** Written content set in the page's reading column. */
export const ContentBlock: React.FC<ContentBlockProps> = ({ columns, width }) => {
  if (!columns?.length) return null

  return (
    <Section>
      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-9">
        {columns.map((col, index) => {
          const { enableLink, link, richText, size } = col
          return (
            <div
              className={cn(width === 'wide' ? colSpan[size ?? 'full'] : 'measure lg:col-span-9')}
              key={col.id ?? index}
            >
              {richText && <RichText data={richText} />}
              {enableLink && link && (
                <div className="mt-8">
                  <CMSLink {...link} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
