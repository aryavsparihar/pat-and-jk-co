import type { SiteSetting, Venture } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { docPath } from '@/utilities/docHref'
import Link from 'next/link'
import React from 'react'

import { BrandLogo } from '../BrandLogo'
import { SocialLinks } from '../SocialLinks'

type Props = {
  settings: SiteSetting | null
  ventures: Venture[]
}

const listLink =
  'underline decoration-transparent underline-offset-[0.22em] hover:decoration-current'

export const SiteFooter: React.FC<Props> = ({ settings, ventures }) => {
  const year = new Date().getFullYear()
  const name = settings?.copyrightName || settings?.siteName || ''
  const listedVentures = ventures.filter((v) => v.stage !== 'coming-soon')

  return (
    <footer className="on-dark bg-primary">
      <div className="container pb-10 pt-[clamp(4rem,7vw,6rem)]">
        <div className="grid gap-x-12 gap-y-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link
              aria-label={`${settings?.siteName ?? ''}, home`}
              className="inline-block"
              href="/"
            >
              <BrandLogo className="w-[min(15rem,60vw)]" settings={settings} variant="onDark" />
            </Link>
            {settings?.footerBlurb && (
              <p className="measure mt-8 opacity-85">{settings.footerBlurb}</p>
            )}
          </div>

          {settings?.footerNav && settings.footerNav.length > 0 && (
            <nav aria-label="Footer" className="md:col-span-2 md:col-start-7">
              <p className="label mb-4">Pages</p>
              <ul className="space-y-1.5">
                {settings.footerNav.map(({ link, id }) => (
                  <li key={id}>
                    <CMSLink className={listLink} {...link} />
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {listedVentures.length > 0 && (
            <div className="md:col-span-2">
              <p className="label mb-4">Ventures</p>
              <ul className="space-y-1.5">
                {listedVentures.map((venture) => (
                  <li key={venture.id}>
                    <Link className={listLink} href={docPath('ventures', venture.slug)}>
                      {venture.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(settings?.email ||
            settings?.phone ||
            settings?.address ||
            settings?.socials?.length) && (
            <div className="md:col-span-2">
              <p className="label mb-4">Contact</p>
              <ul className="space-y-1.5">
                {settings?.email && (
                  <li>
                    <a className={`${listLink} break-all`} href={`mailto:${settings.email}`}>
                      {settings.email}
                    </a>
                  </li>
                )}
                {settings?.phone && (
                  <li>
                    <a className={listLink} href={`tel:${settings.phone.replace(/\s+/g, '')}`}>
                      {settings.phone}
                    </a>
                  </li>
                )}
                {settings?.address && <li className="whitespace-pre-line">{settings.address}</li>}
              </ul>
              <SocialLinks className="mt-4 flex-col gap-y-1.5" socials={settings?.socials} />
            </div>
          )}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-border pt-6 text-base opacity-75 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {name}
          </p>
          {settings?.legalLinks && settings.legalLinks.length > 0 && (
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {settings.legalLinks.map(({ link, id }) => (
                <li key={id}>
                  <CMSLink className={listLink} {...link} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  )
}
