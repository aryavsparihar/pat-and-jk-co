import React from 'react'

import { headingId, nodeText } from '@/utilities/headingId'

type Node = { type?: string; tag?: string; children?: unknown[] }
type Group = { label: string; id: string; links: { label: string; id: string }[] }

/** Main headings (h2) as groups, their subheadings (h3) as links; a main heading with none is left out */
export const sectionGroups = (data: unknown): Group[] => {
  const groups: Group[] = []
  for (const node of ((data as { root?: Node })?.root?.children ?? []) as Node[]) {
    if (node.type !== 'heading') continue
    const label = nodeText(node).trim()
    if (!label) continue
    if (node.tag === 'h2') groups.push({ label, id: headingId(label), links: [] })
    else if (node.tag === 'h3' && groups.length) {
      groups[groups.length - 1]!.links.push({ label, id: headingId(label) })
    }
  }
  return groups.filter((g) => g.links.length > 0)
}

/** A long document's contents, in the left margin, following the reader down the page */
export const SectionNav: React.FC<{ data: unknown }> = ({ data }) => {
  const groups = sectionGroups(data)
  if (!groups.length) return null
  return (
    <nav
      aria-label="Sections"
      className="max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain text-base lg:sticky lg:top-28"
    >
      <ul className="grid gap-y-6">
        {groups.map((group) => (
          <li key={group.id}>
            <p className="label mb-2">
              <a className="hover:underline" href={`#${group.id}`}>
                {group.label}
              </a>
            </p>
            <ul className="grid gap-y-1.5">
              {group.links.map((link) => (
                <li key={link.id}>
                  <a
                    className="underline decoration-transparent underline-offset-[0.22em] hover:decoration-current"
                    href={`#${link.id}`}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  )
}
