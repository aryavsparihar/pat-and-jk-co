import type { LeadershipBlock as LeadershipBlockProps, Person } from '@/payload-types'

import { PersonCard, PersonFeature } from '@/components/cards/PersonCard'
import { Reveal } from '@/components/Reveal'
import { SectionHeader } from '@/components/Typography'
import { getPeople } from '@/utilities/queries'
import { cn } from '@/utilities/ui'
import React from 'react'

import type { BlockContext } from '../types'

export const LeadershipBlock = async ({
  eyebrow,
  heading,
  intro,
  populateBy,
  people: selected,
  ctx,
}: LeadershipBlockProps & { ctx: BlockContext }) => {
  const people: Person[] =
    populateBy === 'selection'
      ? (selected ?? []).filter((p): p is Person => typeof p === 'object')
      : await getPeople(ctx.tenantId)

  if (people.length === 0) return null

  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <SectionHeader className="mb-16" eyebrow={eyebrow} heading={heading} intro={intro} />
        </Reveal>
        {people.length === 1 ? (
          <Reveal>
            <PersonFeature person={people[0]!} />
          </Reveal>
        ) : (
          <div
            className={cn(
              'grid gap-x-12 gap-y-16 sm:grid-cols-2',
              people.length > 2 && 'lg:grid-cols-3',
            )}
          >
            {people.map((person, i) => (
              <Reveal delay={i * 110} key={person.id}>
                <PersonCard person={person} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
