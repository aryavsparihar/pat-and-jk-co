import {
  ADDRESS_RULE_DEFAULT,
  ADDRESS_RULES,
  type AddressRule,
  COUNTRIES,
  DIAL_CODES,
  INDIAN_STATES,
  NO_POSTAL_CODE_NOTE,
} from './data'

/**
 * How an address and a phone number are asked for in each country, with the founder's wording
 * (the Apply2 design and his error messages, 25 November 2026). Pure functions only, so the
 * browser's hints and the server's verdict come from the same place and cannot drift apart.
 */

export const INDIA = 'India'

export const isIndia = (country: string | null | undefined): boolean =>
  !country?.trim() || /^(india|bharat)$/i.test(country.trim())

export const isCountry = (country: string | null | undefined): boolean =>
  typeof country === 'string' && COUNTRIES.includes(country.trim())

export const isIndianState = (state: string | null | undefined): boolean =>
  typeof state === 'string' && INDIAN_STATES.includes(state.trim())

/** The country's address rule, or the default for a country without one of its own */
export const addressRule = (country: string | null | undefined): AddressRule =>
  isIndia(country)
    ? ADDRESS_RULES[INDIA]!
    : (ADDRESS_RULES[country!.trim()] ?? ADDRESS_RULE_DEFAULT)

/** "Postcode" → "postcode" inside a sentence; ZIP, CAP, CEP and Eircode keep their capitals */
const inSentence = (name: string) =>
  /^[A-Z][a-z]/.test(name) && !/^Eircode/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name

/** The labels and help an address form shows for a country, as the Apply2 design words them */
export const addressCopy = (country: string | null | undefined) => {
  const india = isIndia(country)
  const rule = addressRule(country)
  const hasCode = Boolean(rule.code)
  return {
    countryHelp:
      'Choose this first: the rest of the address follows your country’s way of writing it.',
    hasCode,
    codeLabel: rule.code ?? '',
    codeOptional: hasCode && !rule.req,
    codeHelp: india
      ? (rule.help ?? '')
      : `${rule.help ? `${rule.help} ` : ''}We don’t fill anything in from it, so please type the rest of your address.${rule.req ? '' : ' Leave it empty if you don’t have one.'}`,
    codeInputMode: india ? ('numeric' as const) : ('text' as const),
    codeMaxLength: india ? 6 : 12,
    noCodeNote: NO_POSTAL_CODE_NOTE.replace('[country]', country?.trim() || INDIA),
    line1Label: india ? 'House or flat, and street' : 'House or flat, building and street',
    line2Label: 'Area or locality',
    landmarkLabel: 'Landmark',
    /** Without postal codes a landmark matters more, so it is recommended rather than optional */
    landmarkNote: hasCode ? '(optional)' : '(recommended)',
    landmarkHelp: 'Something nearby that helps a courier find you.',
    cityLabel: 'City or town',
    hasDistrict: Boolean(rule.district),
    districtLabel: 'District',
    hasRegion: Boolean(rule.region),
    regionLabel: rule.region ?? '',
    regionFromList: Boolean(rule.list),
    regionOptional: Boolean(rule.region) && !rule.regionReq,
    pinLabel: 'Pin it on a map',
    pinNote: hasCode ? '(optional)' : '(recommended)',
    pinHelp: `${hasCode ? 'Useful when an address is hard to follow.' : 'Without postal codes, a pin is the surest way for a courier to find you.'} The map loads only if you open it.`,
  }
}

/** The second, postal address, used when "Send post to this address" is unticked */
export const POSTAL_ADDRESS_COPY = {
  sameLabel: 'Send post to this address',
  sameHelp: 'Untick it to give a different postal address.',
  legend: 'Postal address',
  addressLabel: 'Address',
  addressHelp: 'House or flat, street, area and landmark.',
} as const

/* ─── Errors ─────────────────────────────────────────────────────────────── */

export const ADDRESS_ERRORS = {
  country: 'Please choose your country.',
  line1: 'Please add the first line of your address.',
  city: 'Please add your city or town.',
  district: 'Please add your district.',
  stateEmpty: 'Please choose your state or union territory.',
  stateNotListed: 'Please choose your state or union territory from the list.',
  pinEmpty: 'Please add your PIN code.',
  pinFormat: 'A PIN code is six digits, for example 184101.',
  pinNotFound:
    'We could not find that PIN code. Please check it, or type your town and district yourself.',
  pinUnavailable:
    'We could not look up your PIN code just now. Please type your town, district and state yourself.',
  pinTooOften: 'Please wait a moment before trying again.',
  pin: 'The pin was not saved. Please place it again.',
  postal: 'Please add the address where we should send post.',
} as const

/** "Please add your county." For a region the country's rule asks for */
export const regionMissing = (country: string | null | undefined): string =>
  isIndia(country)
    ? ADDRESS_ERRORS.stateEmpty
    : `Please add your ${inSentence(addressRule(country).region ?? 'region')}.`

/** "Please add your postcode." For a postal code the country's rule asks for */
export const postalCodeMissing = (country: string | null | undefined): string =>
  isIndia(country)
    ? ADDRESS_ERRORS.pinEmpty
    : `Please add your ${inSentence(addressRule(country).code ?? 'postal code')}.`

/**
 * Each format a postal code must have, with what to say when it does not. Countries with a rule
 * but no line of their own here, and every other country, get the general check.
 */
const POSTAL_FORMATS: Record<string, [RegExp, string]> = {
  India: [/^[1-9]\d{5}$/, ADDRESS_ERRORS.pinFormat],
  'United States': [
    /^\d{5}(-\d{4})?$/,
    'A ZIP code is five digits, or nine with a hyphen, for example 10001-1234.',
  ],
  'United Kingdom': [
    /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/,
    'That does not look like a UK postcode. It should look like SW1A 1AA.',
  ],
  Canada: [
    /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/,
    'A Canadian postal code looks like K1A 0B1.',
  ],
  Australia: [/^\d{4}$/, 'An Australian postcode is four digits.'],
  Ireland: [
    /^([AC-FHKNPRTV-Y]\d{2}|D6W) ?[0-9AC-FHKNPRTV-Y]{4}$/,
    'An Eircode has seven characters, for example D02 X285.',
  ],
}

const CHECK_POSTAL_CODE = 'Please check the postal code.'

/** Digit counts from the founder's help lines, checked with the general message */
const POSTAL_DIGITS: Record<string, RegExp> = {
  Japan: /^\d{3}-?\d{4}$/,
  China: /^\d{6}$/,
  Italy: /^\d{5}$/,
  Brazil: /^\d{5}-?\d{3}$/,
  Mexico: /^\d{5}$/,
  Nepal: /^\d{5}$/,
  'Sri Lanka': /^\d{5}$/,
  Bangladesh: /^\d{4}$/,
  Singapore: /^\d{6}$/,
}

/** A postal code as it is kept: capitals, single spaces, nothing at either end */
export const tidyPostalCode = (value: string): string =>
  value.trim().toUpperCase().replace(/\s+/g, ' ')

/** What is wrong with a postal code for this country, or null if nothing is */
export const postalCodeProblem = (
  country: string | null | undefined,
  value: string | null | undefined,
): string | null => {
  const rule = addressRule(country)
  if (!rule.code) return null
  const code = tidyPostalCode(value ?? '')
  if (!code) return rule.req ? postalCodeMissing(country) : null
  const name = isIndia(country) ? INDIA : country!.trim()
  const format = POSTAL_FORMATS[name]
  if (format) return format[0].test(code) ? null : format[1]
  const digits = POSTAL_DIGITS[name] ?? /^[A-Z0-9][A-Z0-9 -]{1,11}$/
  return digits.test(code) ? null : CHECK_POSTAL_CODE
}

/* ─── Phone ──────────────────────────────────────────────────────────────── */

export const PHONE_COPY = {
  hint: 'Choose the country code, then type the number.',
  codeLabel: 'Country code',
} as const

export const PHONE_ERRORS = {
  code: 'Please choose your country code.',
  empty: 'Please add a phone number.',
} as const

export const phoneTooShort = (country: string): string =>
  `That number looks too short for ${country}. Please check it.`

/** The dial code for a country, e.g. "+91"; null for the few places with none */
export const dialCode = (country: string | null | undefined): string | null =>
  DIAL_CODES.find((d) => d.country === (isIndia(country) ? INDIA : country?.trim()))?.code ?? null

/** "India +91": how the country code picker shows each choice, as in the design */
export const dialLabel = (entry: { country: string; code: string }) =>
  `${entry.country} ${entry.code}`

/**
 * The country a number most likely belongs to, from its dial code alone, for a number saved
 * before the picker existed. Codes shared by several places go to the largest of them.
 */
const SHARED_CODE_HOME: Record<string, string> = {
  '+1': 'United States',
  '+7': 'Russia',
  '+39': 'Italy',
  '+44': 'United Kingdom',
  '+47': 'Norway',
  '+61': 'Australia',
  '+212': 'Morocco',
  '+262': 'Réunion',
  '+358': 'Finland',
  '+590': 'Guadeloupe',
  '+599': 'Curaçao',
}

/** A full number ("+447911123456") split into its country and the rest, for the picker */
export const splitPhone = (
  e164: string | null | undefined,
): { country: string; number: string } | null => {
  const value = e164?.trim().replace(/[\s().-]/g, '')
  if (!value?.startsWith('+')) return null
  // The longest code that fits, so a number from +358 (Finland) is not read as +35…
  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((d) => value.startsWith(d.code))
  if (!match) return null
  const country = SHARED_CODE_HOME[match.code] ?? match.country
  return { country, number: value.slice(match.code.length) }
}

/** The fewest and most digits after the dial code, where a country's numbers have a fixed length */
const NATIONAL_LENGTH: Record<string, [number, number]> = {
  '+91': [10, 10],
  '+1': [10, 10],
  '+44': [9, 10],
  '+61': [9, 9],
  '+971': [8, 9],
}

/**
 * A country and a number typed after its code, as one international number (E.164: + and up to
 * 15 digits), or what to tell the person. A trunk 0 at the start is dropped (07911… in the UK),
 * and so is the code if they typed it again. Indian numbers are mobiles: ten digits from 6 to 9.
 */
export const toInternational = (
  country: string | null | undefined,
  number: string | null | undefined,
): { ok: true; e164: string } | { ok: false; message: string } => {
  const code = dialCode(country)
  if (!country?.trim() || !code) return { ok: false, message: PHONE_ERRORS.code }
  let digits = (number ?? '').replace(/[\s().-]/g, '')
  if (!digits) return { ok: false, message: PHONE_ERRORS.empty }
  const name = isIndia(country) ? INDIA : country.trim()
  // A number written with another country's code: the picker is what needs changing
  const international = digits.startsWith('+')
    ? digits.slice(1)
    : digits.startsWith('00')
      ? digits.slice(2)
      : null
  if (international !== null) {
    if (!international.startsWith(code.slice(1))) return { ok: false, message: PHONE_ERRORS.code }
    digits = international.slice(code.length - 1)
  }
  digits = digits.replace(/^0+/, '')
  const [min, max] = NATIONAL_LENGTH[code] ?? [
    Math.max(4, 8 - (code.length - 1)),
    15 - (code.length - 1),
  ]
  if (!/^\d+$/.test(digits) || digits.length < min || digits.length > max) {
    return { ok: false, message: phoneTooShort(name) }
  }
  if (code === '+91' && !/^[6-9]/.test(digits)) return { ok: false, message: phoneTooShort(name) }
  return { ok: true, e164: `${code}${digits}` }
}

/* ─── Trade tax ID and proof ─────────────────────────────────────────────── */

/** The trade application's tax number and proof of practice, which change with the country */
export const tradeCopy = (country: string | null | undefined) =>
  isIndia(country)
    ? {
        taxLabel: 'GSTIN',
        taxHelp:
          'Fifteen characters, if your business is registered for GST. It must be on your invoices for you to claim input tax credit, and cannot be added once an invoice is filed.',
        taxMaxLength: 15,
        proofHelp:
          'A Council of Architecture number, a business card, or a link to a recent project. It speeds up our review.',
      }
    : {
        taxLabel: 'Company registration or VAT number',
        taxHelp:
          'If your business has one. It goes on your invoices, and helps your customs agent when a work arrives.',
        taxMaxLength: 30,
        proofHelp:
          'Membership of a professional body (for example RIBA, AIA or BIID), a business card, or a link to a recent project. It speeds up our review.',
      }

/** Letters, digits and the separators registration and VAT numbers use, 2 to 30 of them */
export const isForeignTaxNumber = (value: string): boolean =>
  /^[A-Z0-9][A-Z0-9 ./-]{1,29}$/i.test(value.trim())
