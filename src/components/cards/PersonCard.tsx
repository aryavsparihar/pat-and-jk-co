import type { Person } from '@/payload-types'

import React from 'react'

import { Media } from '../Media'
import { MotifPanel } from '../MotifPanel'

const initials = (name: string) =>
  name
    .replace(/^(mr|mrs|ms|dr)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 3)
    .join('')

const PersonLinks: React.FC<{ links: Person['links'] }> = ({ links }) =>
  links && links.length > 0 ? (
    <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
      {links.map((link) => (
        <li key={link.id}>
          <a className="btn-text" href={link.url} rel="noopener noreferrer" target="_blank">
            {link.label}{' '}
            <span aria-hidden className="arrow">
              ↗
            </span>
          </a>
        </li>
      ))}
    </ul>
  ) : null

const Portrait: React.FC<{ person: Person }> = ({ person }) => {
  const portrait = person.portrait && typeof person.portrait === 'object' ? person.portrait : null
  return (
    <div className="zoom-media relative aspect-[4/5] overflow-hidden">
      {portrait ? (
        <Media
          fill
          imgClassName="object-cover"
          resource={portrait}
          size="(max-width: 768px) 100vw, 40vw"
        />
      ) : (
        <MotifPanel size="lg" title={initials(person.name)} />
      )}
    </div>
  )
}

/** Large side-by-side profile, used when a page features a single person (e.g. the founder). */
export const PersonFeature: React.FC<{ person: Person }> = ({ person }) => (
  <article className="grid items-center gap-x-20 gap-y-10 md:grid-cols-12">
    <div className="md:col-span-5">
      <Portrait person={person} />
    </div>
    <div className="md:col-span-6 md:col-start-7">
      <p className="eyebrow">{person.role}</p>
      <h3 className="display-lg mt-4">{person.name}</h3>
      {person.bio && <p className="lede mt-8 whitespace-pre-line">{person.bio}</p>}
      <PersonLinks links={person.links} />
    </div>
  </article>
)

export const PersonCard: React.FC<{ person: Person }> = ({ person }) => {
  return (
    <article className="group">
      <Portrait person={person} />
      <p className="eyebrow mt-6">{person.role}</p>
      <h3 className="display-sm mt-2">{person.name}</h3>
      {person.bio && (
        <p className="mt-4 whitespace-pre-line text-[0.95rem] leading-relaxed text-muted-foreground">
          {person.bio}
        </p>
      )}
      <PersonLinks links={person.links} />
    </article>
  )
}
