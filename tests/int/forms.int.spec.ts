import { describe, expect, it } from 'vitest'

import {
  aboutSchema,
  addressStepSchema,
  fieldErrors,
  partnerSchema,
  portfolioSchema,
  practiceSchema,
} from '@/members/forms/schemas'
import { STATES_AND_TERRITORIES } from '@/members/forms/india'
import { ageOn, instagramUrl, isGstin, isPin, isWebUrl, toE164 } from '@/members/forms/validators'

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
      stylesThemes: 'Landscapes of the Shivalik foothills.',
      yearsPractising: 6,
      bio: 'A painter working in oils and watercolour. '.repeat(3),
      priceRange: '25k-1l',
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

  it('need three to ten works', () => {
    const work = {
      image: 1,
      title: 'Untitled',
      year: 2024,
      medium: 'Oil on canvas',
      widthCm: 60,
      heightCm: 90,
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
})
