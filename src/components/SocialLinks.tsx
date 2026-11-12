import type { SiteSetting } from '@/payload-types'

import { hasSocialIcon, SOCIAL_ICON_BODY } from '@/brands/socialIcons'
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

/**
 * PJK's own social links (Site settings → Contact & social), each with its platform's mark
 * drawn in outline in the text colour beside the name: white in the footer, ink on paper.
 */
export const SocialLinks: React.FC<{ socials?: Social[] | null; className?: string }> = ({
  socials,
  className,
}) => {
  if (!socials?.length) return null
  return (
    <ul className={cn('flex flex-wrap gap-x-6 gap-y-2', className)}>
      {socials.map((social) => (
        <li key={social.id ?? social.url}>
          <a
            className="link link-caps inline-flex items-center gap-2"
            href={social.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {hasSocialIcon(social.platform) && (
              <svg
                aria-hidden
                className="size-[1.15rem] shrink-0"
                dangerouslySetInnerHTML={{ __html: SOCIAL_ICON_BODY[social.platform] }}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.6}
                viewBox="0 0 24 24"
              />
            )}
            {labels[social.platform]}
          </a>
        </li>
      ))}
    </ul>
  )
}
