import type { SiteSetting } from '@/payload-types'

import { cn } from '@/utilities/ui'
import React from 'react'

type Social = NonNullable<SiteSetting['socials']>[number]

const labels: Record<Social['platform'], string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  behance: 'Behance',
  other: 'Website',
}

/** Text links rather than icons — quieter, and readable without an icon font. */
export const SocialLinks: React.FC<{ socials?: Social[] | null; className?: string }> = ({
  socials,
  className,
}) => {
  if (!socials?.length) return null
  return (
    <ul className={cn('flex flex-wrap gap-x-6 gap-y-2', className)}>
      {socials.map((social) => (
        <li key={social.id ?? social.url}>
          <a className="link link-caps" href={social.url} rel="noopener noreferrer" target="_blank">
            {labels[social.platform]}
          </a>
        </li>
      ))}
    </ul>
  )
}
