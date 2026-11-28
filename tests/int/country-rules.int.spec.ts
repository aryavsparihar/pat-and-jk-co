// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { COUNTRIES, DIAL_CODES, INDIAN_STATES } from '@/forms/country/data'
import {
  addressCopy,
  addressRule,
  dialCode,
  isForeignTaxNumber,
  postalCodeMissing,
  postalCodeProblem,
  regionMissing,
  splitPhone,
  toInternational,
  tradeCopy,
} from '@/forms/country/rules'

/*
 * The country rules of the founder's brief (25 November 2026, section 5): India first, an address
 * that follows the country's own way of writing it, and the wording of his error messages.
 */

describe('the country lists', () => {
  it('put India first, then the rest from A to Z', () => {
    expect(COUNTRIES[0]).toBe('India')
    expect(DIAL_CODES[0]).toEqual({ country: 'India', code: '+91' })
    const rest = COUNTRIES.slice(1)
    expect([...rest].sort((a, b) => a.localeCompare(b, 'en'))).toEqual(rest)
    expect(COUNTRIES).toHaveLength(250)
    expect(INDIAN_STATES).toHaveLength(36)
  })
})

describe('an address, country by country', () => {
  it('in India: PIN code, district, and the states from a list', () => {
    const copy = addressCopy('India')
    expect(copy.codeLabel).toBe('PIN code')
    expect(copy.codeHelp).toBe('Six digits. We fill in the town, district and state from it.')
    expect(copy.codeInputMode).toBe('numeric')
    expect(copy.codeMaxLength).toBe(6)
    expect(copy.line1Label).toBe('House or flat, and street')
    expect(copy.hasDistrict).toBe(true)
    expect(copy.regionFromList).toBe(true)
    expect(copy.regionOptional).toBe(false)
  })

  it('in the United Kingdom: postcode required, county optional, nothing filled in', () => {
    const copy = addressCopy('United Kingdom')
    expect(copy.codeLabel).toBe('Postcode')
    expect(copy.codeOptional).toBe(false)
    expect(copy.codeHelp).toBe(
      'For example, SW1A 1AA. We don’t fill anything in from it, so please type the rest of your address.',
    )
    expect(copy.line1Label).toBe('House or flat, building and street')
    expect(copy.hasDistrict).toBe(false)
    expect(copy.regionLabel).toBe('County')
    expect(copy.regionOptional).toBe(true)
  })

  it('in the UAE: no postal code, so the note, and a pin and landmark are recommended', () => {
    const copy = addressCopy('United Arab Emirates')
    expect(copy.hasCode).toBe(false)
    expect(copy.noCodeNote).toMatch(/^Postal codes are not used in United Arab Emirates, so/)
    expect(copy.landmarkNote).toBe('(recommended)')
    expect(copy.pinNote).toBe('(recommended)')
    expect(copy.pinHelp).toBe(
      'Without postal codes, a pin is the surest way for a courier to find you. The map loads only if you open it.',
    )
    expect(regionMissing('United Arab Emirates')).toBe('Please add your emirate.')
  })

  it('anywhere else: the default rule, an optional postal code that may be left empty', () => {
    expect(addressRule('Germany')).toEqual(addressRule('Peru'))
    const copy = addressCopy('Germany')
    expect(copy.codeOptional).toBe(true)
    expect(copy.codeHelp).toBe(
      'As your post office writes it. We don’t fill anything in from it, so please type the rest of your address. Leave it empty if you don’t have one.',
    )
    expect(copy.regionLabel).toBe('State, province or region')
    expect(postalCodeProblem('Germany', '')).toBeNull()
  })
})

describe('postal codes', () => {
  it('names each country’s code in its own words when it is missing', () => {
    expect(postalCodeMissing('India')).toBe('Please add your PIN code.')
    expect(postalCodeMissing('United Kingdom')).toBe('Please add your postcode.')
    expect(postalCodeMissing('United States')).toBe('Please add your ZIP code.')
    expect(postalCodeMissing('Ireland')).toBe('Please add your Eircode.')
    expect(postalCodeMissing('Canada')).toBe('Please add your postal code.')
    expect(postalCodeProblem('United States', '')).toBe('Please add your ZIP code.')
  })

  it('accepts each country’s real codes', () => {
    for (const [country, code] of [
      ['India', '184101'],
      ['United States', '10001'],
      ['United States', '10001-1234'],
      ['United Kingdom', 'SW1A 1AA'],
      ['United Kingdom', 'sw1a1aa'],
      ['Canada', 'K1A 0B1'],
      ['Australia', '2000'],
      ['Ireland', 'D02 X285'],
      ['Japan', '100-0001'],
      ['Brazil', '01310-100'],
      ['Germany', '10115'],
      ['Netherlands', '1012 AB'],
    ]) {
      expect(postalCodeProblem(country, code), `${country} ${code}`).toBeNull()
    }
  })

  it('says what a code should look like when it is wrong', () => {
    expect(postalCodeProblem('India', '012345')).toBe(
      'A PIN code is six digits, for example 184101.',
    )
    expect(postalCodeProblem('United States', '1000')).toBe(
      'A ZIP code is five digits, or nine with a hyphen, for example 10001-1234.',
    )
    expect(postalCodeProblem('United Kingdom', '12345')).toBe(
      'That does not look like a UK postcode. It should look like SW1A 1AA.',
    )
    expect(postalCodeProblem('Canada', '12345')).toBe('A Canadian postal code looks like K1A 0B1.')
    expect(postalCodeProblem('Australia', '20000')).toBe('An Australian postcode is four digits.')
    expect(postalCodeProblem('Ireland', 'D02')).toBe(
      'An Eircode has seven characters, for example D02 X285.',
    )
    expect(postalCodeProblem('Japan', '1000')).toBe('Please check the postal code.')
    expect(postalCodeProblem('Germany', '#!')).toBe('Please check the postal code.')
  })

  it('asks for none where a country has none', () => {
    expect(postalCodeProblem('United Arab Emirates', '')).toBeNull()
    expect(postalCodeProblem('Hong Kong', 'anything')).toBeNull()
  })
})

describe('phone numbers', () => {
  it('turns a country and a local number into one international number', () => {
    expect(toInternational('India', '98765 43210')).toEqual({ ok: true, e164: '+919876543210' })
    expect(toInternational('India', '098765 43210')).toEqual({ ok: true, e164: '+919876543210' })
    expect(toInternational('United Kingdom', '07911 123456')).toEqual({
      ok: true,
      e164: '+447911123456',
    })
    expect(toInternational('United States', '+1 (212) 555-0100')).toEqual({
      ok: true,
      e164: '+12125550100',
    })
    expect(toInternational('Germany', '0044 30 123456')).toEqual({
      ok: false,
      message: 'Please choose your country code.',
    })
    expect(toInternational('Germany', '030 1234567')).toEqual({ ok: true, e164: '+49301234567' })
  })

  it('uses the founder’s wording when something is missing or short', () => {
    expect(toInternational('', '9876543210')).toEqual({
      ok: false,
      message: 'Please choose your country code.',
    })
    expect(toInternational('India', '')).toEqual({
      ok: false,
      message: 'Please add a phone number.',
    })
    expect(toInternational('India', '98765')).toEqual({
      ok: false,
      message: 'That number looks too short for India. Please check it.',
    })
    expect(toInternational('India', '1234567890').ok).toBe(false)
  })

  it('finds the country again from a saved number', () => {
    expect(splitPhone('+919876543210')).toEqual({ country: 'India', number: '9876543210' })
    expect(splitPhone('+447911123456')).toEqual({ country: 'United Kingdom', number: '7911123456' })
    expect(splitPhone('+12125550100')).toEqual({ country: 'United States', number: '2125550100' })
    expect(splitPhone('+358401234567')).toEqual({ country: 'Finland', number: '401234567' })
    expect(splitPhone('9876543210')).toBeNull()
    expect(dialCode('Antarctica')).toBeNull()
  })
})

describe('the trade application’s tax number', () => {
  it('is a GSTIN in India, and a company registration or VAT number elsewhere', () => {
    expect(tradeCopy('India').taxLabel).toBe('GSTIN')
    expect(tradeCopy('United Kingdom').taxLabel).toBe('Company registration or VAT number')
    expect(tradeCopy('United Kingdom').proofHelp).toMatch(/RIBA, AIA or BIID/)
    expect(isForeignTaxNumber('GB 123 4567 89')).toBe(true)
    expect(isForeignTaxNumber('<script>')).toBe(false)
  })
})
