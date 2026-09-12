import type { LeadershipBlock as LeadershipBlockProps, Person } from '@/payload-types'

import { PersonCard, PersonFeature } from '@/components/cards/PersonCard'
import { Section, SectionHeading } from '@/components/Typography'
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
    <Section label={eyebrow}>
      <SectionHeading heading={heading} intro={intro} />
      {people.length === 1 ? (
        <PersonFeature person={people[0]!} />
      ) : (
        <div
          className={cn(
            'grid gap-x-10 gap-y-14 sm:grid-cols-2',
            people.length > 2 && 'lg:grid-cols-3',
          )}
        >
          {people.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </div>
      )}
    </Section>
  )
}
