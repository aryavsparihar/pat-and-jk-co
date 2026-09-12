import type { SiteSetting, Venture } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { docPath } from '@/utilities/docHref'
import Link from 'next/link'
import React from 'react'

import { BrandLogo } from '../BrandLogo'
import { SocialLinks } from '../SocialLinks'
import { Ornament } from '../Typography'

type Props = {
  settings: SiteSetting | null
  ventures: Venture[]
}

const columnTitle = 'eyebrow mb-6 !text-background/60'

export const SiteFooter: React.FC<Props> = ({ settings, ventures }) => {
  const year = new Date().getFullYear()
  const name = settings?.copyrightName || settings?.siteName || ''
  const listedVentures = ventures.filter((v) => v.stage !== 'coming-soon')

  return (
    <footer className="on-dark bg-primary">
      <div className="container pb-10 pt-[clamp(4.5rem,8vw,7rem)]">
        <div className="grid gap-x-12 gap-y-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link
              aria-label={`${settings?.siteName ?? ''} — home`}
              className="inline-block"
              href="/"
            >
              <BrandLogo className="w-[min(18rem,70vw)]" settings={settings} variant="onDark" />
            </Link>
            {settings?.footerBlurb && (
              <p className="mt-10 max-w-sm leading-relaxed text-background/75">
                {settings.footerBlurb}
              </p>
            )}
          </div>

          {settings?.footerNav && settings.footerNav.length > 0 && (
            <nav aria-label="Footer" className="lg:col-span-2 lg:col-start-7">
              <p className={columnTitle}>Explore</p>
              <ul className="space-y-3">
                {settings.footerNav.map(({ link, id }) => (
                  <li key={id}>
                    <CMSLink
                      className="text-background/85 transition-colors hover:text-background"
                      {...link}
                    />
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {listedVentures.length > 0 && (
            <div className="lg:col-span-2">
              <p className={columnTitle}>Ventures</p>
              <ul className="space-y-3">
                {listedVentures.map((venture) => (
                  <li key={venture.id}>
                    <Link
                      className="text-background/85 transition-colors hover:text-background"
                      href={docPath('ventures', venture.slug)}
                    >
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
            <div className="lg:col-span-2">
              <p className={columnTitle}>Contact</p>
              <ul className="space-y-3 text-background/85">
                {settings?.email && (
                  <li>
                    <a
                      className="break-all hover:text-background"
                      href={`mailto:${settings.email}`}
                    >
                      {settings.email}
                    </a>
                  </li>
                )}
                {settings?.phone && (
                  <li>
                    <a
                      className="hover:text-background"
                      href={`tel:${settings.phone.replace(/\s+/g, '')}`}
                    >
                      {settings.phone}
                    </a>
                  </li>
                )}
                {settings?.address && (
                  <li className="whitespace-pre-line text-sm">{settings.address}</li>
                )}
              </ul>
              <SocialLinks className="mt-6 flex-col gap-y-3" socials={settings?.socials} />
            </div>
          )}
        </div>

        <Ornament className="mt-20 text-background/50" rule />

        <div className="mt-10 flex flex-col gap-4 text-[0.78rem] text-background/60 md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {name}. All rights reserved.
          </p>
          {settings?.legalLinks && settings.legalLinks.length > 0 && (
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {settings.legalLinks.map(({ link, id }) => (
                <li key={id}>
                  <CMSLink className="transition-colors hover:text-background" {...link} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  )
}
