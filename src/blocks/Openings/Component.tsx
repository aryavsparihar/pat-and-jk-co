import type { Opening, OpeningsBlock as OpeningsBlockProps } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Reveal } from '@/components/Reveal'
import { SectionHeader } from '@/components/Typography'
import { getOpenings } from '@/utilities/queries'
import React from 'react'

import type { BlockContext } from '../types'

const typeLabel: Record<Opening['type'], string> = {
  artist: 'Artist call',
  collaborator: 'Collaborator',
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
    <section className="section">
      <div className="container">
        <Reveal>
          <SectionHeader className="mb-14" eyebrow={eyebrow} heading={heading} intro={intro} />
        </Reveal>

        {openings.length > 0 ? (
          <ul className="border-b border-border">
            {openings.map((opening, i) => (
              <Reveal
                as="li"
                className="grid gap-6 border-t border-border py-10 md:grid-cols-12 md:items-start"
                delay={i * 80}
                key={opening.id}
              >
                <div className="md:col-span-3">
                  <p className="eyebrow">{typeLabel[opening.type]}</p>
                  {opening.commitment && (
                    <p className="mt-2 text-sm text-muted-foreground">{opening.commitment}</p>
                  )}
                </div>
                <div className="md:col-span-6">
                  <h3 className="display-sm">{opening.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{opening.summary}</p>
                </div>
                <div className="md:col-span-3 md:text-right">
                  <CMSLink
                    appearance="outline"
                    label={opening.applyLabel || 'Express interest'}
                    size="sm"
                    type="custom"
                    url={opening.applyUrl || '/contact'}
                  />
                </div>
              </Reveal>
            ))}
          </ul>
        ) : (
          <p className="font-serif text-2xl italic text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </section>
  )
}
