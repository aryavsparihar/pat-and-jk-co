import { describe, expect, it } from 'vitest'

import { newIdentityCode } from '@/members/ids'
import { isPinCode, placeFromPostOffices, stateFromIndiaPost } from '@/members/pincode'
import { agreedInWords } from '@/members/terms'

describe('a PIN code fills in the town, district and state', () => {
  it('takes India Post’s spellings onto our list of states', () => {
    expect(stateFromIndiaPost('Jammu & Kashmir')).toBe('Jammu and Kashmir')
    expect(stateFromIndiaPost('Andaman & Nicobar Islands')).toBe('Andaman and Nicobar Islands')
    expect(stateFromIndiaPost('Pondicherry')).toBe('Puducherry')
    expect(stateFromIndiaPost('Chattisgarh')).toBe('Chhattisgarh')
    expect(stateFromIndiaPost('Dadra & Nagar Haveli')).toBe(
      'Dadra and Nagar Haveli and Daman and Diu',
    )
    expect(stateFromIndiaPost('Atlantis')).toBeNull()
  })

  it('names the town from the block the post offices share, else the one office, else the district', () => {
    expect(
      placeFromPostOffices([
        { Name: 'Kathua', Block: 'Kathua', District: 'Kathua', State: 'Jammu & Kashmir' },
      ]),
    ).toEqual({ city: 'Kathua', district: 'Kathua', state: 'Jammu and Kashmir' })
    expect(
      placeFromPostOffices([
        { Name: 'Hiranagar', Block: 'NA', District: 'Kathua', State: 'Jammu & Kashmir' },
      ]),
    ).toEqual({ city: 'Hiranagar', district: 'Kathua', state: 'Jammu and Kashmir' })
    expect(
      placeFromPostOffices([
        { Name: 'One', Block: 'East', District: 'Example', State: 'Delhi' },
        { Name: 'Two', Block: 'West', District: 'Example', State: 'Delhi' },
      ]),
    ).toEqual({ city: 'Example', district: 'Example', state: 'Delhi' })
    expect(placeFromPostOffices([])).toBeNull()
  })

  it('looks up only six-digit PIN codes', () => {
    expect(isPinCode('184101')).toBe(true)
    for (const bad of ['084101', '18410', '1841011', '18410a', ''])
      expect(isPinCode(bad)).toBe(false)
  })
})

describe('agreeing to the terms', () => {
  it('takes I AGREE, however it is typed, and nothing else', () => {
    for (const ok of ['I AGREE', 'i agree', '  I   agree ']) expect(agreedInWords(ok)).toBe(true)
    for (const bad of ['', 'I agre', 'yes', 'AGREE', undefined, true])
      expect(agreedInWords(bad)).toBe(false)
  })
})

describe('the identity code', () => {
  it('is six unambiguous characters, split for writing by hand', () => {
    const codes = new Set(Array.from({ length: 300 }, newIdentityCode))
    expect(codes.size).toBe(300)
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJKMNP-TW-Z]{3}-[2-9A-HJKMNP-TW-Z]{3}$/)
  })
})
