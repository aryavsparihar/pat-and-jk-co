import type { PathsBlock as PathsBlockProps } from '@/payload-types'

import { RowArrow } from '@/components/RowArrow'
import { Section, SectionHeading } from '@/components/Typography'
import Link from 'next/link'
import React from 'react'

const HREF = { artists: '/collaborate/artists', partners: '/collaborate/partners' } as const

/**
 * Two warm cards on the paper tone, each a link: artists, with Phulhaar's garland, since that is
 * where they apply; and partners. A gentle lift on hover (none under reduced motion), the site's
 * leaning arrow, square corners and hairlines as everywhere else. The section also answers to
 * #form, where the open calls and older links used to point.
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
    <ol className="grid gap-5 md:grid-cols-2 md:gap-6">
      {(['artists', 'partners'] as const).map((key) => {
        const item = key === 'artists' ? artists : partners
        if (!item?.heading) return null
        return (
          <li key={key}>
            <Link
              className={`row-link group flex h-full flex-col border p-7 ${key === 'artists' ? 'phulhaar-card' : 'border-border bg-surface'} transition duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_10px_30px_-18px_color-mix(in_oklab,var(--primary)_45%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-10`}
              href={HREF[key]}
            >
              {key === 'artists' ? (
                // Phulhaar's garland, on the paper tone the mark is drawn for (docs/BRANDS.md)
                // Shown 72 pixels wide, so a 144- or 288-pixel copy, not the 200 KB original
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="mb-8 h-auto w-[4.5rem]"
                  height={1200}
                  sizes="72px"
                  src="/brand/ventures/phulhaar-garland-144.webp"
                  srcSet="/brand/ventures/phulhaar-garland-144.webp 144w, /brand/ventures/phulhaar-garland-288.webp 288w"
                  width={795}
                />
              ) : (
                // PJK's own sprig, drawn in the ink of the page
                <span aria-hidden className="mb-8 flex items-end md:h-[6.8rem]">
                  <span
                    className="block h-6 w-28 bg-[var(--ink)]"
                    style={{
                      mask: 'url(/brand/pjk-sprig.svg) center / contain no-repeat',
                      WebkitMask: 'url(/brand/pjk-sprig.svg) center / contain no-repeat',
                    }}
                  />
                </span>
              )}
              <span className="display-md row-title block">{item.heading}</span>
              <span className="lede measure mt-4 block flex-1">{item.text}</span>
              <span className="link-caps mt-10 flex items-center gap-4">
                {item.linkLabel}
                <RowArrow />
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
    {signInText && (
      <p className="muted mt-10">
        <Link className="link" href="/collaborate/signin">
          {signInText}
        </Link>
      </p>
    )}
  </Section>
)
