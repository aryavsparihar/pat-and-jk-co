import { describe, expect, it } from 'vitest'

import {
  aboutSchema,
  addressStepSchema,
  fieldErrors,
  partnerSchema,
  TRADE_ROLES,
  portfolioSchema,
  portfolioWorkSchema,
  practiceSchema,
  TAKEN_MEDIUMS,
  experienceLabel,
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
    expect(fieldErrors(wrongPin.error!)['residence.postalCode']).toBe(
      'A PIN code is six digits, for example 184101.',
    )
  })

  it('write an address the way its country does', () => {
    const london = {
      country: 'United Kingdom',
      postalCode: 'sw1a 1aa',
      line1: '10 Example Street',
      city: 'London',
      district: 'left over from India',
      state: '',
    }
    const parsed = addressStepSchema.safeParse({ residence: london, correspondenceSame: true })
    expect(parsed.success).toBe(true)
    // No district outside India, the postcode in capitals, and an empty county left out
    expect(parsed.data!.residence).toMatchObject({ postalCode: 'SW1A 1AA', city: 'London' })
    expect(parsed.data!.residence).not.toHaveProperty('district', expect.anything())
    expect(parsed.data!.residence.state).toBeUndefined()

    const dubai = { country: 'United Arab Emirates', line1: 'Villa 4, Street 12', city: 'Dubai' }
    const noEmirate = addressStepSchema.safeParse({ residence: dubai })
    expect(fieldErrors(noEmirate.error!)['residence.state']).toBe('Please add your emirate.')
    const withEmirate = addressStepSchema.safeParse({
      residence: { ...dubai, state: 'Dubai', postalCode: '00000' },
    })
    expect(withEmirate.success).toBe(true)
    // The UAE has no postal codes, so none is kept
    expect(withEmirate.data!.residence.postalCode).toBeUndefined()

    const nowhere = addressStepSchema.safeParse({ residence: { ...london, country: 'Narnia' } })
    expect(fieldErrors(nowhere.error!)['residence.country']).toBe('Please choose your country.')
  })

  it('take the postal address with its own country, in one box', () => {
    const residence = {
      line1: 'House 1, Example Lane',
      city: 'Kathua',
      district: 'Kathua',
      state: 'Jammu and Kashmir',
      postalCode: '184101',
      country: 'India',
    }
    const empty = addressStepSchema.safeParse({
      residence,
      correspondenceSame: false,
      correspondence: { country: 'United States' },
    })
    const errors = fieldErrors(empty.error!)
    expect(errors['correspondence.line1']).toBe('Please add the address where we should send post.')
    expect(errors['correspondence.postalCode']).toBe('Please add your ZIP code.')
    expect(errors['correspondence.state']).toBe('Please add your state.')
    const full = addressStepSchema.safeParse({
      residence,
      correspondenceSame: false,
      correspondence: {
        country: 'United States',
        line1: '1 Example Avenue\nApartment 2',
        city: 'New York',
        postalCode: '10001',
        state: 'New York',
      },
    })
    expect(full.success).toBe(true)
  })

  it('take a phone number as a country code and a number', () => {
    const about = {
      legalName: 'Example Person',
      displayName: 'Example',
      dateOfBirth: '1990-01-01',
      consentProcessing: true,
    }
    const parse = (phone: string) => aboutSchema.safeParse({ ...about, phone })
    expect(parse('+44 07911 123456').data?.phone).toBe('+447911123456')
    expect(parse('+91 98765 43210').data?.phone).toBe('+919876543210')
    // A number saved before the country code picker was Indian
    expect(parse('9876543210').data?.phone).toBe('+919876543210')
    expect(fieldErrors(parse('+91 98765').error!).phone).toBe(
      'That number looks too short for India. Please check it.',
    )
    expect(fieldErrors(parse('').error!).phone).toBe('Please add a phone number.')
  })

  it('ask for consent to the notice in step 1, and no longer for a language', () => {
    const about = {
      legalName: 'Example Person',
      displayName: 'Example',
      dateOfBirth: '1990-01-01',
      phone: '+91 98765 43210',
    }
    expect(aboutSchema.safeParse({ ...about, consentProcessing: true }).success).toBe(true)
    expect(fieldErrors(aboutSchema.safeParse(about).error!).consentProcessing).toBe(
      'Please tick the box to give your consent, so that we can check your details and, if we work together, pay you.',
    )
    const young = new Date()
    young.setFullYear(young.getFullYear() - 17)
    expect(
      fieldErrors(
        aboutSchema.safeParse({
          ...about,
          consentProcessing: true,
          dateOfBirth: young.toISOString().slice(0, 10),
        }).error!,
      ).dateOfBirth,
    ).toMatch(/^Thank you for thinking of us. Phulhaar can only represent artists who are 18/)
    expect(
      fieldErrors(
        aboutSchema.safeParse({ ...about, consentProcessing: true, dateOfBirth: '1990-02-31' })
          .error!,
      ).dateOfBirth,
    ).toBe('Please choose your date of birth from the calendar.')
  })

  it('offer only original, hand-made media and the new price bands', () => {
    const base = {
      mediums: ['painting'],
      stylesThemes:
        'Landscapes of the Shivalik foothills, painted outdoors in every season, in oil and watercolour.',
      yearsPractising: 6,
      bio: 'A painter working in oils and watercolour. '.repeat(6),
      priceRange: 'under-10k',
      recognitionNone: true,
    }
    expect(practiceSchema.safeParse(base).success).toBe(true)
    // A draft started before the change still has photography: it is named, to be unticked
    expect(
      fieldErrors(
        practiceSchema.safeParse({ ...base, mediums: ['painting', 'photography'] }).error!,
      ).mediums,
    ).toBe(
      'Phulhaar takes original, hand-made work only, so Photography can no longer be chosen. Please untick it.',
    )
    expect(TAKEN_MEDIUMS.map((m) => m.label)).toEqual([
      'Painting',
      'Miniature painting',
      'Drawing',
      'Illustration',
      'Calligraphy',
      'Sculpture',
      'Ceramics and pottery',
      'Wood carving',
      'Metalwork',
      'Glass',
      'Papier-mâché',
      'Textile and fibre art',
      'Embroidery',
      'Folk and tribal art',
      'Collage',
      'Mixed media',
      'Other',
    ])
    // The bands before the design can be read, but not chosen again
    expect(practiceSchema.safeParse({ ...base, priceRange: 'not-sure' }).success).toBe(false)
    expect(experienceLabel(4)).toBe('3 to 5 years')
    expect(experienceLabel(0)).toBe('Less than a year')
    expect(experienceLabel(40)).toBe('More than 10 years')
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
      priceRange: '10k-25k',
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

  it('take sizes with decimals in cm or inches, and keep them in cm too', () => {
    const work = {
      image: 1,
      title: 'Untitled',
      year: new Date().getFullYear(),
      medium: 'Oil on canvas',
    }
    const inches = portfolioWorkSchema.parse({ ...work, width: '12,5', height: 20, unit: 'in' })
    expect(inches).toMatchObject({ width: 12.5, unit: 'in', widthCm: 31.75, heightCm: 50.8 })
    expect(inches.depthCm).toBeUndefined()
    // Metres are no longer offered; a work saved in them comes back in centimetres
    expect(
      fieldErrors(portfolioWorkSchema.safeParse({ ...work, width: 1, height: 1, unit: 'm' }).error!)
        .unit,
    ).toBe('Please choose centimetres or inches.')
    expect(
      portfolioWorkSchema.safeParse({ ...work, width: 2500, height: 1, unit: 'cm' }).success,
    ).toBe(false)
    // For sale needs a price in whole rupees; not for sale keeps none
    expect(
      fieldErrors(
        portfolioWorkSchema.safeParse({ ...work, width: 1, height: 1, forSale: true }).error!,
      ).priceInr,
    ).toBe('Please give the price in rupees, as a number.')
    const notForSale = portfolioWorkSchema.parse({
      ...work,
      width: 1,
      height: 1,
      forSale: false,
      priceInr: 5000,
    })
    expect(notForSale.priceInr).toBeUndefined()
    expect('forSale' in notForSale).toBe(false)
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

  it('check a trade GSTIN only when one is given, and only in India', () => {
    const partner = {
      subType: 'Interior designer',
      fullName: 'Ravi Example',
      role: 'Principal',
      phone: '+91 98765 43210',
      country: 'India',
      city: 'Jammu',
      state: 'Jammu and Kashmir',
      interest: 'Placing original work in residential projects.',
    }
    expect(partnerSchema.safeParse(partner).success).toBe(true)
    expect(partnerSchema.safeParse({ ...partner, gstin: '27AAPFU0939F1ZW' }).success).toBe(false)
    expect(partnerSchema.safeParse({ ...partner, subType: 'Gallery' }).success).toBe(false)
    const abroad = { ...partner, country: 'France', state: '', phone: '+33 6 12 34 56 78' }
    expect(partnerSchema.safeParse({ ...abroad, gstin: 'FR 40 303 265 045' }).success).toBe(true)
    expect(partnerSchema.safeParse({ ...abroad, gstin: '#####' }).success).toBe(false)
  })

  it('offer the nine trade roles of the design', () => {
    const partner = {
      subType: 'Curator buying for clients',
      fullName: 'Meera Example',
      role: 'Art consultant',
      phone: '+91 98765 43210',
      country: 'India',
      city: 'Jammu',
      state: 'Jammu and Kashmir',
      interest: 'Finding original work for collectors I advise.',
    }
    expect(TRADE_ROLES).toHaveLength(9)
    for (const subType of TRADE_ROLES)
      expect(partnerSchema.safeParse({ ...partner, subType }).success).toBe(true)
    expect(
      partnerSchema.safeParse({ ...partner, subType: 'Art dealer / art consultant' }).success,
    ).toBe(false)
    // The state comes from India's list
    expect(partnerSchema.safeParse({ ...partner, state: 'Kashmir' }).success).toBe(false)
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
