import type { PathsBlock as PathsBlockProps } from '@/payload-types'

import { RowArrow } from '@/components/RowArrow'
import { Section, SectionHeading } from '@/components/Typography'
import Link from 'next/link'
import React from 'react'

const HREF = { artists: '/collaborate/artists', partners: '/collaborate/partners' } as const

/**
 * Two generous rows, each a link, with the site's hairline underline and leaning arrow. The
 * section also answers to #form, where the open calls and older links used to point.
 */
export const PathsBlock: React.FC<PathsBlockProps> = ({
  eyebrow,
  heading,
  intro,
  artists,
  partners,
  signInText,
}) => (
  <Section id="apply" label={eyebrow}>
    <span id="form" />
    <SectionHeading heading={heading} intro={intro} />
    <ol className="border-t border-border-strong">
      {(['artists', 'partners'] as const).map((key) => {
        const item = key === 'artists' ? artists : partners
        if (!item?.heading) return null
        return (
          <li className="border-b border-border" key={key}>
            <Link
              className="row-link grid gap-x-10 gap-y-3 py-10 transition-colors hover:bg-surface sm:grid-cols-[1fr_auto] sm:items-end"
              href={HREF[key]}
            >
              <span>
                <span className="display-md row-title block">{item.heading}</span>
                <span className="lede measure mt-3 block">{item.text}</span>
              </span>
              <span className="link-caps flex items-center gap-4 sm:pb-2">
                {item.linkLabel}
                <RowArrow />
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
    {signInText && (
      <p className="muted mt-8">
        <Link className="link" href="/collaborate/signin">
          {signInText}
        </Link>
      </p>
    )}
  </Section>
)
