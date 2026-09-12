import type { Opening, OpeningsBlock as OpeningsBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Section, SectionHeading } from '@/components/Typography'
import { getOpenings } from '@/utilities/queries'
import React from 'react'

import type { BlockContext } from '../types'

const typeLabel: Record<Opening['type'], string> = {
  artist: 'Artist call',
  collaborator: 'Collaboration',
  partner: 'Partnership',
  role: 'Role',
}

export const OpeningsBlock = async ({
  eyebrow,
  heading,
  intro,
  emptyMessage,
  ctx,
}: OpeningsBlockProps & { ctx: BlockContext }) => {
  const openings = (await getOpenings(ctx.tenantId)).filter((o) => o.status === 'open')

  return (
    <Section label={eyebrow}>
      <SectionHeading heading={heading} intro={intro} />
      {openings.length > 0 ? (
        <ul className="border-t border-border-strong">
          {openings.map((opening) => (
            <li
              className="grid gap-x-12 gap-y-3 border-b border-border py-8 lg:grid-cols-9"
              key={opening.id}
            >
              <div className="lg:col-span-3">
                <p className="label">{typeLabel[opening.type]}</p>
                {opening.commitment && (
                  <p className="muted mt-1 text-base italic">{opening.commitment}</p>
                )}
              </div>
              <div className="lg:col-span-6">
                <h3 className="display-sm">{opening.title}</h3>
                <p className="measure mt-3">{opening.summary}</p>
                <CMSLink
                  appearance="text"
                  className="mt-4 inline-block"
                  label={opening.applyLabel || 'Express interest'}
                  type="custom"
                  url={opening.applyUrl || '/contact'}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted italic">{emptyMessage}</p>
      )}
    </Section>
  )
}
