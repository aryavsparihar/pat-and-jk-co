import { describe, expect, it } from 'vitest'

import {
  aboutSchema,
  addressStepSchema,
  fieldErrors,
  partnerSchema,
  portfolioSchema,
  portfolioWorkSchema,
  practiceSchema,
} from '@/members/forms/schemas'
import { STATES_AND_TERRITORIES } from '@/members/forms/india'
import {
  ageOn,
  instagramUrl,
  isGstin,
  isPin,
  isWebUrl,
  todayInIndia,
  toE164,
} from '@/members/forms/validators'

/* Every person and number here is made up. */

describe('validators', () => {
  it('know a PIN code', () => {
    expect(isPin('184101')).toBe(true)
    for (const bad of ['084101', '18410', '1841011', 'ABCDEF', '']) expect(isPin(bad)).toBe(false)
  })

  it('turn phone numbers into E.164', () => {
    expect(toE164('98765 43210')).toBe('+919876543210')
    expect(toE164('098765-43210')).toBe('+919876543210')
    expect(toE164('+91 98765 43210')).toBe('+919876543210')
    expect(toE164('0044 20 7946 0000')).toBe('+442079460000')
    expect(toE164('+1 (555) 010-0199')).toBe('+15550100199')
    // Indian mobiles start 6–9 and have ten digits
    expect(toE164('+91 12345 67890')).toBeNull()
    expect(toE164('12345')).toBeNull()
    expect(toE164('')).toBeNull()
  })

  it('check a GSTIN down to its check character', () => {
    // A commonly published example with a valid checksum
    expect(isGstin('27AAPFU0939F1ZV')).toBe(true)
    expect(isGstin('27aapfu0939f1zv')).toBe(true)
    expect(isGstin('27AAPFU0939F1ZW')).toBe(false) // wrong check character
    expect(isGstin('99AAPFU0939F1ZV')).toBe(false) // no such state code
    expect(isGstin('27AAPFU0939F1V')).toBe(false) // too short
  })

  it('accept only real web addresses', () => {
    expect(isWebUrl('https://example.com/work')).toBe(true)
    for (const bad of [
      'example.com',
      'javascript:alert(1)',
      'ftp://example.com',
      'https://localhost',
    ]) {
      expect(isWebUrl(bad)).toBe(false)
    }
  })

  it('normalise Instagram handles', () => {
    expect(instagramUrl('@studio.asha')).toBe('https://www.instagram.com/studio.asha')
    expect(instagramUrl('https://instagram.com/studio_asha/')).toBe(
      'https://www.instagram.com/studio_asha',
    )
    expect(instagramUrl('not a handle')).toBeNull()
  })

  it('count age in whole years, birthdays included', () => {
    const today = new Date(Date.UTC(2026, 9, 2))
    expect(ageOn('2008-10-02', today)).toBe(18)
    expect(ageOn('2008-10-03', today)).toBe(17)
    expect(ageOn('2026-02-30', today)).toBeNull()
  })

  it('count birthdays by the day in India', () => {
    // 00:30 in India on 2 October is still 1 October in UTC
    const justAfterMidnight = new Date(Date.UTC(2026, 9, 1, 19, 0))
    expect(ageOn('2008-10-02', todayInIndia(justAfterMidnight))).toBe(18)
    expect(ageOn('2008-10-02', justAfterMidnight)).toBe(17)
  })

  it('list every state and union territory once', () => {
    expect(STATES_AND_TERRITORIES).toHaveLength(36)
    expect(new Set(STATES_AND_TERRITORIES).size).toBe(36)
    expect(STATES_AND_TERRITORIES).toContain('Jammu and Kashmir')
  })
})

describe('step schemas', () => {
  it('refuse an applicant under 18, kindly', () => {
    const young = new Date()
    young.setUTCFullYear(young.getUTCFullYear() - 17)
    const result = aboutSchema.safeParse({
      legalName: 'Asha Example',
      displayName: 'Asha',
      dateOfBirth: young.toISOString().slice(0, 10),
      phone: '9876543210',
      language: 'English',
    })
    expect(result.success).toBe(false)
    expect(fieldErrors(result.error!).dateOfBirth).toMatch(/18 or over/)
  })

  it('only ask for a second address when it differs', () => {
    const residence = {
      line1: 'House 1, Example Lane',
      city: 'Kathua',
      district: 'Kathua',
      state: 'Jammu and Kashmir',
      postalCode: '184101',
      country: 'India',
    }
    expect(addressStepSchema.safeParse({ residence, correspondenceSame: true }).success).toBe(true)
    const missing = addressStepSchema.safeParse({
      residence,
      correspondenceSame: false,
      correspondence: {},
    })
    expect(missing.success).toBe(false)
    expect(Object.keys(fieldErrors(missing.error!))).toContain('correspondence.line1')
    const wrongPin = addressStepSchema.safeParse({
      residence: { ...residence, postalCode: '84101' },
    })
    expect(fieldErrors(wrongPin.error!)['residence.postalCode']).toMatch(/six digits/)
  })

  it('ask what "other" means, and hold the biography to its limit', () => {
    const base = {
      mediums: ['painting', 'other'],
      stylesThemes:
        'Landscapes of the Shivalik foothills, painted outdoors in every season, in oil and watercolour.',
      yearsPractising: 6,
      bio: 'A painter working in oils and watercolour. '.repeat(6),
      priceRange: '25k-1l',
      recognitionNone: true,
    }
    const result = practiceSchema.safeParse(base)
    expect(fieldErrors(result.error!).mediumOther).toMatch(/which other/)
    expect(practiceSchema.safeParse({ ...base, mediumOther: 'Pigment on paper' }).success).toBe(
      true,
    )
    expect(
      practiceSchema.safeParse({ ...base, mediumOther: 'x', bio: 'x'.repeat(1201) }).success,
    ).toBe(false)
  })

  it('hold required descriptions to their minimums, and only those', () => {
    const base = {
      mediums: ['painting'],
      stylesThemes:
        'Landscapes of the Shivalik foothills, painted outdoors in every season, in oil and watercolour.',
      yearsPractising: 0,
      bio: 'A painter working in oils and watercolour. '.repeat(6),
      priceRange: '25k-1l',
      recognitionNone: true,
    }
    expect(practiceSchema.safeParse(base).success).toBe(true)
    const short = practiceSchema.safeParse({
      ...base,
      stylesThemes: 'Landscapes.',
      bio: 'x'.repeat(249),
    })
    expect(fieldErrors(short.error!).stylesThemes).toMatch(/at least 80/)
    expect(fieldErrors(short.error!).bio).toMatch(/at least 250/)
    // Optional fields have no minimum
    expect(
      practiceSchema.safeParse({ ...base, statement: 'Short.', training: 'Self-taught.' }).success,
    ).toBe(true)
    // "Less than one" is 0; up to 120
    expect(practiceSchema.safeParse({ ...base, yearsPractising: 121 }).success).toBe(false)
  })

  it('ask for exhibitions and awards in full, or "None yet"', () => {
    const base = {
      mediums: ['ceramics', 'papier-mache'],
      stylesThemes:
        'Landscapes of the Shivalik foothills, painted outdoors in every season, in oil and watercolour.',
      yearsPractising: 3,
      bio: 'A potter working in local clay. '.repeat(9),
      priceRange: 'not-sure',
    }
    expect(fieldErrors(practiceSchema.safeParse(base).error!).recognition).toMatch(/None yet/)
    const entry = {
      kind: 'award',
      title: 'District crafts prize',
      venue: 'Kathua',
      year: new Date().getFullYear() - 1,
      details:
        'Given each year to a young craftsperson from the district, for a set of three bowls.',
    }
    expect(practiceSchema.safeParse({ ...base, recognition: [entry] }).success).toBe(true)
    const partial = practiceSchema.safeParse({
      ...base,
      recognition: [{ ...entry, venue: '', details: 'Too short.' }],
    })
    expect(Object.keys(fieldErrors(partial.error!))).toEqual(
      expect.arrayContaining(['recognition.0.venue', 'recognition.0.details']),
    )
    // "None yet" wins over half-filled entries left behind
    const none = practiceSchema.safeParse({ ...base, recognitionNone: true, recognition: [{}] })
    expect(none.success).toBe(true)
    expect(none.data?.recognition).toEqual([])
  })

  it('take Instagram and Facebook as links or names, and other platforms in pairs', () => {
    const base = {
      mediums: ['painting'],
      stylesThemes:
        'Landscapes of the Shivalik foothills, painted outdoors in every season, in oil and watercolour.',
      yearsPractising: 6,
      bio: 'A painter working in oils and watercolour. '.repeat(6),
      priceRange: '25k-1l',
      recognitionNone: true,
    }
    const parsed = practiceSchema.safeParse({
      ...base,
      instagram: '@asha.example',
      facebook: 'facebook.com/asha.example.art',
      otherSocials: [{ platform: 'Behance', handle: 'asha-example' }],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data!.instagram).toBe('https://www.instagram.com/asha.example')
    expect(parsed.data!.facebook).toBe('https://www.facebook.com/asha.example.art')
    expect(
      practiceSchema.safeParse({ ...base, otherSocials: [{ platform: 'Behance', handle: '' }] })
        .success,
    ).toBe(false)
  })

  it('take sizes with decimals in cm, inches or metres, and keep them in cm too', () => {
    const work = {
      image: 1,
      title: 'Untitled',
      year: new Date().getFullYear(),
      medium: 'Oil on canvas',
    }
    const inches = portfolioWorkSchema.parse({ ...work, width: '12,5', height: 20, unit: 'in' })
    expect(inches).toMatchObject({ width: 12.5, unit: 'in', widthCm: 31.75, heightCm: 50.8 })
    expect(inches.depthCm).toBeUndefined()
    expect(
      portfolioWorkSchema.parse({ ...work, width: 1.2, height: 0.8, depth: 0.05, unit: 'm' }),
    ).toMatchObject({ widthCm: 120, heightCm: 80, depthCm: 5 })
    expect(
      portfolioWorkSchema.safeParse({ ...work, width: 25, height: 1, unit: 'm' }).success,
    ).toBe(false)
    expect(
      portfolioWorkSchema.safeParse({
        ...work,
        year: new Date().getFullYear() - 100,
        width: 1,
        height: 1,
      }).success,
    ).toBe(false)
  })

  it('need three to ten works', () => {
    const work = {
      image: 1,
      title: 'Untitled',
      year: 2024,
      medium: 'Oil on canvas',
      width: 60,
      height: 90,
      unit: 'cm',
    }
    expect(portfolioSchema.safeParse({ works: [work, work] }).success).toBe(false)
    expect(portfolioSchema.safeParse({ works: [work, work, work] }).success).toBe(true)
    expect(portfolioSchema.safeParse({ works: Array(11).fill(work) }).success).toBe(false)
  })

  it('check a partner GSTIN only when one is given', () => {
    const partner = {
      category: 'placement',
      subType: 'Interior designer',
      fullName: 'Ravi Example',
      role: 'Principal',
      phone: '+91 98765 43210',
      city: 'Jammu',
      state: 'Jammu and Kashmir',
      interest: 'Placing original work in residential projects.',
      message: 'We design homes in Jammu and would like to source art locally.',
    }
    expect(partnerSchema.safeParse(partner).success).toBe(true)
    expect(partnerSchema.safeParse({ ...partner, gstin: '27AAPFU0939F1ZW' }).success).toBe(false)
    expect(partnerSchema.safeParse({ ...partner, subType: 'Gallery' }).success).toBe(false)
  })

  it('offer art dealers and art consultants among curators and among partners', () => {
    const partner = {
      category: 'placement',
      subType: 'Art dealer / art consultant',
      fullName: 'Meera Example',
      role: 'Art consultant',
      phone: '+91 98765 43210',
      city: 'Jammu',
      state: 'Jammu and Kashmir',
      interest: 'Finding original work for collectors I advise.',
      message: 'I advise private collectors in Jammu and Delhi on contemporary work.',
    }
    expect(partnerSchema.safeParse(partner).success).toBe(true)
    expect(partnerSchema.safeParse({ ...partner, category: 'partnership' }).success).toBe(true)
    expect(partnerSchema.safeParse({ ...partner, category: 'design-technology' }).success).toBe(
      false,
    )
  })
})

describe('identity details', () => {
  it('accept names in any script, and cap every free-text field', async () => {
    const { kycSchema } = await import('@/kyc/schema')
    const base = {
      consent: true,
      consentReadToEnd: true,
      consentTyped: 'I AGREE',
      pan: 'ABCPE1234F',
      idChoice: 'other',
      otherIdKind: 'passport',
      addressOnIdMatches: true,
      documents: { 'other-id': 1, 'pan-card': 2, 'identity-photo': 3 },
    }
    for (const panName of ["Asha D'Souza-Rao", 'आशा राव', 'عاشہ راؤ'])
      expect(kycSchema.safeParse({ ...base, panName }).success).toBe(true)
    expect(kycSchema.safeParse({ ...base, panName: 'x'.repeat(121) }).success).toBe(false)
    expect(kycSchema.safeParse({ ...base, panName: 'Asha', pan: 'A'.repeat(5000) }).success).toBe(
      false,
    )
  })
})
