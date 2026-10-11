import React from 'react'

import { SOCIAL_ICON_BODY, type SocialPlatform } from '@/brands/socialIcons'
import { cn } from '@/utilities/ui'

/** A brand's own social accounts, each with its platform's mark beside the name */
export const BrandSocialLinks: React.FC<{
  heading: string
  links: { platform: SocialPlatform; label: string; url: string }[]
  className?: string
}> = ({ heading, links, className }) => {
  if (!links.length) return null
  return (
    <div className={className}>
      <p className="label">{heading}</p>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
        {links.map((link) => (
          <li key={link.platform}>
            <a
              className={cn('link inline-flex min-h-11 items-center gap-2')}
              href={link.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <svg
                aria-hidden
                className="size-5 shrink-0"
                dangerouslySetInnerHTML={{ __html: SOCIAL_ICON_BODY[link.platform] }}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.6}
                viewBox="0 0 24 24"
              />
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
