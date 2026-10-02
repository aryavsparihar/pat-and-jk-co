import type { SiteSetting } from '@/payload-types'

/**
 * The registered office, from Site settings → Contact & social, in every shape the site needs:
 * lines for an <address> element, one line for an email footer, a directions link, and
 * schema.org's PostalAddress for search engines.
 *
 * The structured fields win. While they are empty, the old free-text address is used instead,
 * so a brand that has not filled them in looks exactly as it did.
 */

type Settings = Pick<SiteSetting, 'office' | 'address' | 'mapUrl'> | null | undefined

const clean = (value?: string | null) => (value ?? '').replace(/\s+/g, ' ').trim()

const isIndia = (country?: string | null) => /^(india|in|bharat)$/i.test(clean(country))

/** "Ward No. 7, ITI Road" / "Opposite Brahman Sabha" / "Kathua, Jammu and Kashmir 184101" / "India" */
export const officeLines = (settings: Settings): string[] => {
  const office = settings?.office
  const street = [office?.line1, office?.line2].map(clean).filter(Boolean).join(', ')
  const region = [clean(office?.state), clean(office?.postalCode)].filter(Boolean).join(' ')
  const locality = [clean(office?.city), region].filter(Boolean).join(', ')

  // The country has a default, so it alone does not make an address
  const hasAddress = Boolean(street || clean(office?.landmark) || locality)
  if (hasAddress) {
    return [street, clean(office?.landmark), locality, clean(office?.country)].filter(Boolean)
  }

  return (settings?.address ?? '')
    .split('\n')
    .map(clean)
    .filter(Boolean)
}

/** The whole address on one line, e.g. for an email footer */
export const officeOneLine = (settings: Settings): string => officeLines(settings).join(', ')

/**
 * Where "Get directions" goes: the map link from Site settings if one is set, otherwise Google
 * Maps' public directions URL for the address (no key, no tracking parameters).
 */
export const directionsUrl = (settings: Settings): string | null => {
  const custom = clean(settings?.mapUrl)
  if (/^https:\/\//i.test(custom)) return custom
  const destination = officeOneLine(settings)
  if (!destination) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/** schema.org PostalAddress, or undefined when there is no structured address */
export const postalAddressJsonLd = (settings: Settings) => {
  const office = settings?.office
  const streetAddress = [office?.line1, office?.line2, office?.landmark]
    .map(clean)
    .filter(Boolean)
    .join(', ')
  if (!streetAddress && !clean(office?.city)) return undefined

  return {
    '@type': 'PostalAddress',
    streetAddress: streetAddress || undefined,
    addressLocality: clean(office?.city) || undefined,
    addressRegion: clean(office?.state) || undefined,
    postalCode: clean(office?.postalCode) || undefined,
    addressCountry: isIndia(office?.country) ? 'IN' : clean(office?.country) || undefined,
  }
}

/** Indian PIN codes: six digits, never starting with 0 */
export const isIndianPin = (value: string): boolean => /^[1-9][0-9]{5}$/.test(value.trim())
