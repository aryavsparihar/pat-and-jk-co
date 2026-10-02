import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { beforeAll, describe, expect, it } from 'vitest'

import { emailFooter, footerFromSettings } from '@/email/footer'
import {
  directionsUrl,
  isIndianPin,
  officeLines,
  officeOneLine,
  postalAddressJsonLd,
} from '@/utilities/address'

const office = {
  line1: 'Ward No. 7',
  line2: 'ITI Road',
  landmark: 'Opposite Brahman Sabha',
  city: 'Kathua',
  state: 'Jammu and Kashmir',
  postalCode: '184101',
  country: 'India',
}
const settings = { office, address: null, mapUrl: null } as never

describe('the registered office', () => {
  it('reads as a postal address', () => {
    expect(officeLines(settings)).toEqual([
      'Ward No. 7, ITI Road',
      'Opposite Brahman Sabha',
      'Kathua, Jammu and Kashmir 184101',
      'India',
    ])
    expect(officeOneLine(settings)).toBe(
      'Ward No. 7, ITI Road, Opposite Brahman Sabha, Kathua, Jammu and Kashmir 184101, India',
    )
  })

  it('falls back to the old free-text address until the fields are filled', () => {
    const legacy = { office: { country: 'India' }, address: 'Line one\n\n  Line two ' } as never
    expect(officeLines(legacy)).toEqual(['Line one', 'Line two'])
    // The country alone, which every brand now has by default, is not an address
    expect(officeLines({ office: { country: 'India' } } as never)).toEqual([])
  })

  it('links to directions, preferring a map link set in the admin', () => {
    expect(directionsUrl(settings)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Ward%20No.%207%2C%20ITI%20Road%2C%20Opposite%20Brahman%20Sabha%2C%20Kathua%2C%20Jammu%20and%20Kashmir%20184101%2C%20India',
    )
    expect(directionsUrl({ office, mapUrl: 'https://maps.app.goo.gl/example' } as never)).toBe(
      'https://maps.app.goo.gl/example',
    )
    // Only https links are trusted from the admin; anything else falls back to directions
    expect(directionsUrl({ office, mapUrl: 'javascript:alert(1)' } as never)).toMatch(
      /^https:\/\/www\.google\.com\/maps\/dir\//,
    )
    expect(directionsUrl({ office: {} } as never)).toBeNull()
  })

  it('describes itself to search engines', () => {
    expect(postalAddressJsonLd(settings)).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Ward No. 7, ITI Road, Opposite Brahman Sabha',
      addressLocality: 'Kathua',
      addressRegion: 'Jammu and Kashmir',
      postalCode: '184101',
      addressCountry: 'IN',
    })
    expect(postalAddressJsonLd({ office: { country: 'India' } } as never)).toBeUndefined()
  })

  it('accepts only real PIN codes', () => {
    expect(isIndianPin('184101')).toBe(true)
    expect(isIndianPin(' 184101 ')).toBe(true)
    for (const bad of ['084101', '18410', '1841011', '18410a', ''])
      expect(isIndianPin(bad)).toBe(false)
  })

  it('signs off every email with it', () => {
    const footer = footerFromSettings(
      { siteName: 'PAT and J.K. Co.', copyrightName: null, office, address: null, mapUrl: null },
      'https://pjk.co.in',
    )
    expect(footer.text).toContain('Kathua, Jammu and Kashmir 184101')
    expect(footer.text).toContain('https://pjk.co.in')
    expect(footer.html).toContain('Ward No. 7, ITI Road<br />Opposite Brahman Sabha')
    expect(footer.html).toContain('<a href="https://pjk.co.in"')
  })

  it('escapes whatever the admin typed before putting it in an email', () => {
    const footer = footerFromSettings(
      {
        siteName: '<b>PJK</b>',
        copyrightName: null,
        office: { line1: 'A & B' },
        address: null,
        mapUrl: null,
      } as never,
      null,
    )
    expect(footer.html).not.toContain('<b>')
    expect(footer.html).toContain('A &#38; B')
  })
})

describe('the email footer, read from a brand’s settings', () => {
  let payload: Payload

  // Starting Payload belongs in a hook, not the test: on a cold CI runner it takes seconds
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('uses the brand’s own office and domain', async () => {
    const context = { disableRevalidate: true }

    const old = await payload.find({
      collection: 'tenants',
      where: { slug: { equals: 'int-test-footer' } },
    })
    for (const t of old.docs) {
      await payload.delete({
        collection: 'site-settings',
        where: { tenant: { equals: t.id } },
        context,
      })
      await payload.delete({ collection: 'tenants', id: t.id, context })
    }

    const tenant = await payload.create({
      collection: 'tenants',
      context,
      data: {
        name: 'Footer test',
        slug: 'int-test-footer',
        domains: [{ domain: 'footer.example.test' }],
      },
    })
    try {
      await payload.create({
        collection: 'site-settings',
        context,
        data: { tenant: tenant.id, siteName: 'Footer Test Co.', office } as never,
      })
      const footer = await emailFooter(payload, tenant.id)
      expect(footer.text).toContain('Footer Test Co.')
      expect(footer.text).toContain('Ward No. 7, ITI Road')
      expect(footer.html).toContain('https://footer.example.test')
    } finally {
      await payload.delete({
        collection: 'site-settings',
        where: { tenant: { equals: tenant.id } },
        context,
      })
      await payload.delete({ collection: 'tenants', id: tenant.id, context })
    }
  })
})
