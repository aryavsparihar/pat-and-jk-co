import type { SiteSetting, Venture } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { officeLines } from '@/utilities/address'
import { docPath } from '@/utilities/docHref'
import Link from 'next/link'
import React from 'react'

import { BrandLogo } from '../BrandLogo'
import { OfficeAddress } from '../OfficeAddress'
import { SocialLinks } from '../SocialLinks'
import { VisitorCount } from '../VisitorCount'

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
        <div className="grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-5">
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
            {/* Under the name, as on a letterhead: the one column with room for the full lines */}
            {officeLines(settings).length > 0 && (
              <div className="mt-8">
                <p className="label mb-3">Registered office</p>
                <OfficeAddress className="opacity-85" settings={settings} />
              </div>
            )}
          </div>

          {settings?.footerNav && settings.footerNav.length > 0 && (
            <nav aria-label="Footer" className="lg:col-span-2 lg:col-start-7">
              <p className="label mb-4">Pages</p>
              <ul className="space-y-2">
                {settings.footerNav.map(({ link, id }) => (
                  <li key={id}>
                    <CMSLink className={listLink} {...link} />
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {listedVentures.length > 0 && (
            <div className="lg:col-span-2">
              <p className="label mb-4">Ventures</p>
              <ul className="space-y-2">
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
            settings?.businessEmail ||
            settings?.technicalEmail ||
            settings?.phone ||
            settings?.socials?.length) && (
            <div className="lg:col-span-2">
              <p className="label mb-4">Contact</p>
              <ul className="space-y-2">
                {settings?.email && (
                  <li>
                    <a className={`${listLink} break-all`} href={`mailto:${settings.email}`}>
                      {settings.email}
                    </a>
                  </li>
                )}
                {settings?.businessEmail && (
                  <li className="pt-1">
                    <span className="block text-base opacity-70">Business enquiries</span>
                    <a
                      className={`${listLink} break-all`}
                      href={`mailto:${settings.businessEmail}`}
                    >
                      {settings.businessEmail}
                    </a>
                  </li>
                )}
                {settings?.technicalEmail && (
                  <li className="pt-1">
                    <span className="block text-base opacity-70">Technical enquiries</span>
                    <a
                      className={`${listLink} break-all`}
                      href={`mailto:${settings.technicalEmail}`}
                    >
                      {settings.technicalEmail}
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
              </ul>
              <SocialLinks className="mt-5 flex-col gap-y-2.5" socials={settings?.socials} />
            </div>
          )}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-border pt-6 text-base opacity-75 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <p>
              © {year} {name}
            </p>
            {settings?.showVisitorCount && <VisitorCount />}
          </div>
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
