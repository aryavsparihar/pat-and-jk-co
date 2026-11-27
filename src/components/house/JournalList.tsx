'use client'

import React, { useState } from 'react'

type Entry = { id: number | string; categories: string[]; node: React.ReactNode }

/** The Journal's categories, in the founder's order (his brief, section 6) */
export const JOURNAL_CATEGORIES = [
  { slug: 'news', title: 'News' },
  { slug: 'artists', title: 'Artists' },
  { slug: 'notes', title: 'Notes' },
] as const

/** The tabs appear once there are this many entries (Journal.html) */
const TABS_FROM = 5

/**
 * Every entry, with All, News, Artists and Notes above them once there are five or more. The
 * page is the same for everyone and stays cached; choosing a category only hides the others.
 */
export const JournalList: React.FC<{ entries: Entry[] }> = ({ entries }) => {
  const [chosen, setChosen] = useState<string | null>(null)
  const tabs = entries.length >= TABS_FROM
  const shown = chosen ? entries.filter((e) => e.categories.includes(chosen)) : entries
  const tab = (slug: string | null, title: string) => (
    <li key={title}>
      <button
        aria-pressed={chosen === slug}
        className="house-small border-b border-transparent pb-1 transition-colors hover:border-[var(--gold)] aria-pressed:border-[var(--primary)] aria-pressed:text-[var(--primary)]"
        onClick={() => setChosen(slug)}
        type="button"
      >
        {title}
      </button>
    </li>
  )
  return (
    <>
      {tabs && (
        <ul aria-label="Categories" className="mb-7 flex flex-wrap gap-x-6 gap-y-2.5">
          {tab(null, 'All')}
          {JOURNAL_CATEGORIES.map((c) => tab(c.slug, c.title))}
        </ul>
      )}
      {shown.length > 0 ? (
        <ul>
          {shown.map((entry) => (
            <li className="-mt-px" key={entry.id}>
              {entry.node}
            </li>
          ))}
        </ul>
      ) : (
        <p className="house-p">Nothing here yet.</p>
      )}
    </>
  )
}
