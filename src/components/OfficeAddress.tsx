import type { SiteSetting } from '@/payload-types'

import { directionsUrl, officeLines } from '@/utilities/address'
import { cn } from '@/utilities/ui'
import React from 'react'

import { Section } from './Typography'

type Props = {
  settings: SiteSetting | null
  className?: string
  /** The link style of wherever it sits: the footer's list links, or the site's small capitals */
  linkClassName?: string
  /** Open with the organisation's name, where the address stands on its own */
  withName?: boolean
}

/** The registered office as a postal address, with a link to directions. */
export const OfficeAddress: React.FC<Props> = ({
  settings,
  className,
  linkClassName = 'link link-caps',
  withName = false,
}) => {
  const lines = officeLines(settings)
  if (lines.length === 0) return null
  const href = directionsUrl(settings)
  const name = settings?.copyrightName || settings?.siteName
  const toGoogle = href?.startsWith('https://www.google.com/maps/')

  return (
    <address className={cn('not-italic', className)}>
      {withName && name && <span className="block">{name}</span>}
      {lines.map((line) => (
        <span className="block" key={line}>
          {line}
        </span>
      ))}
      {href && (
        <a
          // Padded to a 24px target (WCAG 2.2), without moving the text
          className={cn('mt-0.5 inline-block py-1.5', linkClassName)}
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          Get directions
          <span className="sr-only">
            {toGoogle ? ' (opens Google Maps in a new tab)' : ' (opens a map in a new tab)'}
          </span>
        </a>
      )}
    </address>
  )
}

/**
 * The closing section a page can switch on under its sidebar's "Registered office": the privacy
 * policy uses it to name the data controller, a terms page could use it the same way.
 */
export const OfficeSection: React.FC<{
  settings: SiteSetting | null
  label?: string | null
  note?: string | null
}> = ({ settings, label, note }) => {
  if (officeLines(settings).length === 0) return null
  return (
    <Section label={label || 'Registered office'}>
      <div className="measure space-y-6">
        {note && <p className="whitespace-pre-line">{note}</p>}
        <OfficeAddress settings={settings} withName />
        {settings?.email && (
          <p>
            <a className="link" href={`mailto:${settings.email}`}>
              {settings.email}
            </a>
          </p>
        )}
      </div>
    </Section>
  )
}
