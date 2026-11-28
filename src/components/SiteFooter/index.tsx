import type { SiteSetting } from '@/payload-types'

import { hasSocialIcon, SOCIAL_ICON_BODY } from '@/brands/socialIcons'
import { directionsUrl, officeLines } from '@/utilities/address'
import Link from '@/components/IntentLink'
import React from 'react'

type Props = {
  settings: SiteSetting | null
}

type Social = NonNullable<SiteSetting['socials']>[number]

/** The four PJK accounts of the brief, in its order. One not yet set in the admin is left out. */
const SOCIAL_ORDER = ['instagram', 'linkedin', 'facebook', 'x'] as const
const SOCIAL_NAMES: Record<(typeof SOCIAL_ORDER)[number], string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
}

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'The house',
    links: [
      { href: '/about', label: 'About' },
      { href: '/leadership', label: 'Leadership' },
      { href: '/journal', label: 'Journal' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Ventures',
    links: [{ href: '/ventures/phulhaar-gallery', label: 'Phulhaar Gallery by PJK' }],
  },
  {
    heading: 'Work with us',
    links: [
      { href: '/collaborate/artists', label: 'Apply as an artist' },
      { href: '/collaborate/partners', label: 'Apply for a trade account' },
      { href: '/collaborate/curators', label: 'Apply as a guest curator' },
      { href: '/collaborate#openings', label: 'Current openings' },
      { href: '/collaborate/signin', label: 'Sign in' },
    ],
  },
]

/** The address on two lines, as on the design: the street, then the town and country */
const twoLines = (lines: string[]) => {
  const half = Math.ceil(lines.length / 2)
  return [lines.slice(0, half).join(', '), lines.slice(half).join(', ')].filter(Boolean)
}

/**
 * The footer of the founder's design (Footer.html; the brief, section 2): the small wreath between
 * two gold lines, then the green block with the monogram, the line about the house, PJK's four
 * social accounts, the office with Get directions, the three link columns and Get in touch with
 * Help, and the bottom bar with the copyright, the privacy policy and Back to top. The design's
 * Cookie settings link is for when non-essential cookies are used (the brief, section 13); the
 * site sets only the cookies it needs to work, so there are no choices to offer and no link.
 */
export const SiteFooter: React.FC<Props> = ({ settings }) => {
  const year = new Date().getFullYear()
  const name = settings?.copyrightName || settings?.siteName || 'PAT & J.K. Co.'
  const socials = SOCIAL_ORDER.map((platform) =>
    settings?.socials?.find((s: Social) => s.platform === platform && s.url),
  ).filter((s): s is Social => Boolean(s))
  const office = twoLines(officeLines(settings))
  const directions = directionsUrl(settings)
  const contacts = [
    { label: 'General enquiries', email: settings?.email },
    { label: 'Business and trade', email: settings?.businessEmail },
    { label: 'Website and account help', email: settings?.technicalEmail },
  ].filter((c): c is { label: string; email: string } => Boolean(c.email))

  return (
    <footer className="site-footer">
      <div aria-hidden className="flex items-center justify-center gap-4 px-8 pb-14 pt-2">
        <span className="h-px w-14 bg-[#d9c08e]" />
        {/* eslint-disable-next-line @next/next/no-img-element -- a 44px ornament, already small */}
        <img alt="" className="block h-auto w-11" height={68} src="/brand/wreath.png" width={44} />
        <span className="h-px w-14 bg-[#d9c08e]" />
      </div>

      <div className="on-dark bg-primary">
        <div className="container flex flex-wrap gap-x-14 gap-y-10 pb-10 pt-14">
          <div className="min-w-0 flex-[1_1_300px]">
            <Link aria-label={`${name}, home`} className="inline-block" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element -- a 6 KB transparent mark */}
              <img
                alt="PJK"
                className="mb-[22px] block h-auto w-40"
                height={77}
                src="/brand/pjk-monogram-light.png"
                width={160}
              />
            </Link>
            <p className="mb-5 max-w-[340px] text-lg leading-relaxed">
              A house for art and craft from Kathua, Jammu and Kashmir, in India’s far north.
            </p>
            {socials.length > 0 && (
              <ul className="mb-7 flex gap-3.5">
                {socials.map((social) => (
                  <li key={social.platform}>
                    <a
                      aria-label={`PJK on ${SOCIAL_NAMES[social.platform as keyof typeof SOCIAL_NAMES]} (opens in a new tab)`}
                      className="footer-social"
                      href={social.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {hasSocialIcon(social.platform) && (
                        <svg
                          aria-hidden
                          className="size-5"
                          dangerouslySetInnerHTML={{ __html: SOCIAL_ICON_BODY[social.platform] }}
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          viewBox="0 0 24 24"
                        />
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {office.length > 0 && (
              <>
                <p className="footer-heading mb-2.5">Office</p>
                <address className="not-italic">
                  <p className="mb-1.5 text-base leading-relaxed">
                    {office.map((line, i) => (
                      <React.Fragment key={line}>
                        {i > 0 && <br />}
                        {line}
                      </React.Fragment>
                    ))}
                  </p>
                  <p className="mb-2.5 text-base italic text-[#d6dfd8]">Visits by appointment</p>
                  {directions && (
                    <a
                      className="footer-link footer-caps underline underline-offset-[5px]"
                      href={directions}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Get directions
                      <span className="sr-only"> (opens a map in a new tab)</span>
                    </a>
                  )}
                </address>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-[2.2_1_520px] flex-col gap-9">
            <nav aria-label="Footer" className="flex flex-wrap gap-x-10 gap-y-8">
              {COLUMNS.map((column) => (
                <div className="flex-[1_1_160px]" key={column.heading}>
                  <p className="footer-heading mb-4">{column.heading}</p>
                  <ul className="flex flex-col gap-[11px] text-lg">
                    {column.links.map((link) => (
                      <li key={link.href}>
                        <Link className="footer-link" href={link.href}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="border-t border-[#3f5a4a] pt-6">
              <p className="footer-heading mb-4">Get in touch</p>
              <ul className="flex flex-wrap gap-x-10 gap-y-[18px] text-[17px]">
                {contacts.map((contact) => (
                  <li className="flex-[1_1_160px]" key={contact.email}>
                    <span className="block text-sm text-[#a9bcae]">{contact.label}</span>
                    <a className="footer-link underline" href={`mailto:${contact.email}`}>
                      {contact.email}
                    </a>
                  </li>
                ))}
                <li className="flex-[1_1_160px]">
                  <span className="block text-sm text-[#a9bcae]">Help Center</span>
                  <Link className="footer-link underline" href="/help">
                    Help
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="flex flex-wrap justify-between gap-x-7 gap-y-3 border-t border-[#3f5a4a] pb-[26px] pt-5 text-[15px] text-[#d6dfd8]">
            <p>
              © {year} {name}
            </p>
            <ul className="flex flex-wrap gap-x-7 gap-y-3">
              <li>
                <Link className="footer-link underline" href="/privacy">
                  Privacy policy
                </Link>
              </li>
              <li>
                <a className="footer-link underline" href="#top">
                  Back to top ↑
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
