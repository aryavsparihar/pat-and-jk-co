import type { Person } from '@/payload-types'

import React from 'react'

import { Media } from '../Media'

const PersonLinks: React.FC<{ links: Person['links'] }> = ({ links }) =>
  links && links.length > 0 ? (
    <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
      {links.map((link) => (
        <li key={link.id}>
          <a className="link link-caps" href={link.url} rel="noopener noreferrer" target="_blank">
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  ) : null

const portraitOf = (person: Person) =>
  person.portrait && typeof person.portrait === 'object' ? person.portrait : null

const Portrait: React.FC<{ person: Person }> = ({ person }) => {
  const portrait = portraitOf(person)
  if (!portrait) return null
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-surface">
      <Media
        fill
        imgClassName="object-cover"
        resource={portrait}
        size="(max-width: 768px) 100vw, 30vw"
      />
    </div>
  )
}

/**
 * Profile used when a page features a single person (e.g. the founder). The portrait column
 * only appears once a photograph has been uploaded.
 */
export const PersonFeature: React.FC<{ person: Person }> = ({ person }) => {
  const hasPortrait = Boolean(portraitOf(person))
  return (
    <article className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-9">
      {hasPortrait && (
        <div className="max-w-sm lg:col-span-4">
          <Portrait person={person} />
        </div>
      )}
      <div className={hasPortrait ? 'lg:col-span-5' : 'lg:col-span-7'}>
        <h3 className="display-md">{person.name}</h3>
        <p className="label mt-3">{person.role}</p>
        {person.caption && (
          <p className="mt-5 font-display text-[1.35rem] italic text-primary">{person.caption}</p>
        )}
        {person.bio && <p className="measure mt-6 whitespace-pre-line">{person.bio}</p>}
        <PersonLinks links={person.links} />
      </div>
    </article>
  )
}

export const PersonCard: React.FC<{ person: Person }> = ({ person }) => (
  <article>
    <Portrait person={person} />
    <h3 className={portraitOf(person) ? 'display-sm mt-5' : 'display-sm'}>{person.name}</h3>
    <p className="label mt-1">{person.role}</p>
    {person.caption && (
      <p className="mt-3 font-display text-[1.15rem] italic text-primary">{person.caption}</p>
    )}
    {person.bio && <p className="muted mt-3 whitespace-pre-line text-[1.05rem]">{person.bio}</p>}
    <PersonLinks links={person.links} />
  </article>
)
