import { z } from 'zod'

import { PARTNER_CATEGORIES } from '../categories'
import {
  ADDRESS_ERRORS,
  addressRule,
  INDIA,
  isCountry,
  isIndianState,
  PHONE_ERRORS,
  postalCodeProblem,
  regionMissing,
  splitPhone,
  tidyPostalCode,
  toInternational,
} from '@/forms/country/rules'

import { ageOn, facebookUrl, instagramUrl, isGstin, isWebUrl } from './validators'

/**
 * What each step of the onboarding accepts. The browser uses these for gentle inline hints; the
 * server uses the same schemas for the verdict, so a hand-crafted request gets no further than a
 * form would. Messages are written for the person filling the form in: plain, short, never alarming.
 */

const text = (max: number, message = 'Please fill this in.') =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, `Please keep this under ${max} characters.`)

/**
 * A description someone must write: at least `min` characters, so there is something to read. The
 * form shows the count and the minimum as they type; this message is for anyone who sends it short.
 */
const description = (min: number, max: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .min(min, `A little more, please: at least ${min} characters.`)
    .max(max, `Please keep this under ${max} characters.`)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined))

/**
 * A phone number as the country code picker and the number box send it ("+44 07911 123456"), or
 * a bare Indian number saved before the picker, as one international number (E.164). The
 * wording is the founder's, and names the country when the number is too short for it.
 */
const phone = z
  .string({ error: PHONE_ERRORS.empty })
  .trim()
  .transform((value, ctx) => {
    const parts = value.startsWith('+') ? splitPhone(value) : { country: INDIA, number: value }
    const result = parts
      ? toInternational(parts.country, parts.number)
      : ({ ok: false, message: PHONE_ERRORS.code } as const)
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.message })
      return z.NEVER
    }
    return result.e164
  })

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || isWebUrl(v), 'Please use a full web address, e.g. https://example.com')
  .transform((v) => (v ? v : undefined))

const thisYear = new Date().getUTCFullYear()

/** The years a work or an exhibition can be from: this year and the 99 before it */
export const YEARS_BACK = 99
export const yearChoices = (now = new Date().getFullYear()) =>
  Array.from({ length: YEARS_BACK + 1 }, (_, i) => now - i)

/** Optional map pin, dragged into place by the person (no geolocation) */
const coordinate = (min: number, max: number) =>
  z.coerce
    .number()
    .min(min)
    .max(max)
    .transform((v) => Math.round(v * 1e6) / 1e6)
    .optional()
    .or(z.literal('').transform(() => undefined))
    .or(z.null().transform(() => undefined))

/* ─── Artist ─────────────────────────────────────────────────────────────── */

export const LANGUAGES = [
  'English',
  'Hindi',
  'Dogri',
  'Urdu',
  'Punjabi',
  'Kashmiri',
  'Other',
] as const

export const aboutSchema = z.object({
  legalName: text(120, 'Please give your full name as it appears on your documents.'),
  displayName: text(80, 'Please tell us the name you work under.'),
  dateOfBirth: z
    .string({ error: 'Please add your date of birth.' })
    .trim()
    .refine((v) => ageOn(v) !== null, 'Please use the date picker, or the form YYYY-MM-DD.')
    .refine(
      (v) => (ageOn(v) ?? 0) >= 18,
      'Thank you for thinking of us. We can only work with artists who are 18 or over, and we would be glad to hear from you then.',
    )
    .refine((v) => (ageOn(v) ?? 0) <= 120, 'Please check the year.'),
  phone,
  language: z.enum(LANGUAGES, { error: 'Please choose a language.' }),
})

/** What is left of an optional part of an address: the trimmed text, or nothing */
const tidyOptional = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

/**
 * Checks the parts of an address the country decides: the postal code (its name, whether it is
 * needed and its format), the district (India only) and the region (a list in India, the
 * country's own word elsewhere, and none where addresses have none). What the country does not
 * use is dropped, so nothing from a country chosen earlier is kept by mistake.
 */
const countryParts = (
  value: { country: string; postalCode?: string; district?: string; state?: string },
  ctx: z.RefinementCtx,
  { district = true }: { district?: boolean } = {},
) => {
  const rule = addressRule(value.country)
  const out: { postalCode?: string; district?: string; state?: string } = {}
  if (rule.code) {
    const problem = postalCodeProblem(value.country, value.postalCode)
    if (problem) ctx.addIssue({ code: 'custom', path: ['postalCode'], message: problem })
    out.postalCode = tidyPostalCode(value.postalCode ?? '').slice(0, 12) || undefined
  }
  if (district && rule.district) {
    out.district = tidyOptional(value.district)?.slice(0, 80)
    if (!out.district) {
      ctx.addIssue({ code: 'custom', path: ['district'], message: ADDRESS_ERRORS.district })
    }
  }
  if (rule.region) {
    out.state = tidyOptional(value.state)?.slice(0, 80)
    if (rule.list && out.state && !isIndianState(out.state)) {
      ctx.addIssue({ code: 'custom', path: ['state'], message: ADDRESS_ERRORS.stateNotListed })
    } else if (rule.regionReq && !out.state) {
      ctx.addIssue({ code: 'custom', path: ['state'], message: regionMissing(value.country) })
    }
  }
  return out
}

const countryName = z
  .string({ error: ADDRESS_ERRORS.country })
  .trim()
  .refine(isCountry, ADDRESS_ERRORS.country)

/**
 * A home address, written the way its country writes one (the Apply2 design): the country first,
 * then the postal code where there is one, the first line, area, landmark, town, the district in
 * India and the region where the country has one, and an optional map pin.
 */
/** Free text an address may hold; required parts are checked with the rest, so all show at once */
const addressText = z
  .string()
  .optional()
  .transform((v) => v ?? '')

/** A required part of an address: its trimmed text, or the founder's message for it */
const required = (
  value: string,
  max: number,
  message: string,
  path: string,
  ctx: z.RefinementCtx,
) => {
  const text = value.trim()
  if (!text) ctx.addIssue({ code: 'custom', path: [path], message })
  else if (text.length > max) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `Please keep this under ${max} characters.`,
    })
  }
  return text
}

/** An optional part: its trimmed text, or nothing */
const optionalPart = (value: string, max: number, path: string, ctx: z.RefinementCtx) => {
  const text = value.trim()
  if (text.length > max) {
    ctx.addIssue({
      code: 'custom',
      path: [path],
      message: `Please keep this under ${max} characters.`,
    })
  }
  return text || undefined
}

/**
 * A home address, written the way its country writes one (the Apply2 design): the country first,
 * then the postal code where there is one, the first line, area, landmark, town, the district in
 * India and the region where the country has one, and an optional map pin. Every part is checked
 * together, so the person sees everything that needs another look at once.
 */
export const addressSchema = z
  .object({
    country: countryName.default(INDIA),
    postalCode: addressText,
    line1: addressText,
    line2: addressText,
    landmark: addressText,
    city: addressText,
    district: addressText,
    state: addressText,
    latitude: coordinate(-90, 90),
    longitude: coordinate(-180, 180),
  })
  .transform((value, ctx) => {
    if ((value.latitude === undefined) !== (value.longitude === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['latitude'], message: ADDRESS_ERRORS.pin })
    }
    return {
      country: value.country,
      line1: required(value.line1, 120, ADDRESS_ERRORS.line1, 'line1', ctx),
      line2: optionalPart(value.line2, 120, 'line2', ctx),
      landmark: optionalPart(value.landmark, 120, 'landmark', ctx),
      city: required(value.city, 80, ADDRESS_ERRORS.city, 'city', ctx),
      ...countryParts(value, ctx),
      latitude: value.latitude,
      longitude: value.longitude,
    }
  })

/**
 * The postal address, when "Send post to this address" is unticked: its own country, the address
 * in one box, the town, and the postal code and region where that country has them.
 */
export const postalAddressSchema = z
  .object({
    country: countryName.default(INDIA),
    line1: addressText,
    city: addressText,
    postalCode: addressText,
    state: addressText,
  })
  .transform((value, ctx) => ({
    country: value.country,
    line1: required(value.line1, 400, ADDRESS_ERRORS.postal, 'line1', ctx),
    city: required(value.city, 80, ADDRESS_ERRORS.city, 'city', ctx),
    ...countryParts(value, ctx, { district: false }),
  }))

export const addressStepSchema = z
  .object({
    residence: addressSchema,
    correspondenceSame: z.boolean().default(true),
    correspondence: z.unknown().optional(),
  })
  .transform((value, ctx) => {
    if (value.correspondenceSame) return { ...value, correspondence: undefined }
    const parsed = postalAddressSchema.safeParse(value.correspondence ?? {})
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['correspondence', ...issue.path] } as never)
      }
      return z.NEVER
    }
    return { ...value, correspondence: parsed.data }
  })

/** Stored values never change once used; labels may */
export const MEDIUMS = [
  { value: 'painting', label: 'Painting' },
  { value: 'miniature-painting', label: 'Miniature painting' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'calligraphy', label: 'Calligraphy' },
  { value: 'printmaking', label: 'Printmaking' },
  { value: 'photography', label: 'Photography' },
  { value: 'sculpture', label: 'Sculpture' },
  { value: 'ceramics', label: 'Ceramics and pottery' },
  { value: 'wood', label: 'Wood carving' },
  { value: 'metal', label: 'Metalwork' },
  { value: 'glass', label: 'Glass' },
  { value: 'papier-mache', label: 'Papier-mâché' },
  { value: 'textile', label: 'Textile and fibre art' },
  { value: 'embroidery', label: 'Embroidery' },
  { value: 'folk-tribal', label: 'Folk and tribal art' },
  { value: 'murals', label: 'Murals and public art' },
  { value: 'installation', label: 'Installation' },
  { value: 'performance', label: 'Performance' },
  { value: 'video', label: 'Video and film' },
  { value: 'digital', label: 'Digital and new media' },
  { value: 'collage', label: 'Collage' },
  { value: 'mixed-media', label: 'Mixed media' },
  { value: 'other', label: 'Other' },
] as const

export const PRICE_RANGES = [
  { value: 'under-25k', label: 'Under ₹25,000' },
  { value: '25k-1l', label: '₹25,000 to ₹1 lakh' },
  { value: '1l-5l', label: '₹1 lakh to ₹5 lakh' },
  { value: 'over-5l', label: 'Over ₹5 lakh' },
  { value: 'not-sure', label: 'Not sure yet' },
] as const

export const RECOGNITION_KINDS = [
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'award', label: 'Award' },
  { value: 'residency', label: 'Residency' },
  { value: 'publication', label: 'Publication' },
] as const

const values = <T extends readonly { value: string }[]>(list: T) =>
  list.map((i) => i.value) as [T[number]['value'], ...T[number]['value'][]]

export const BIO_LIMIT = 1200

/** The shortest a required description can be, shown as the person types */
export const MIN_LENGTH = { general: 80, bio: 250 } as const
export const DETAILS_LIMIT = 600

/** "Less than one" is stored as 0 */
export const YEARS_PRACTISING_MAX = 120
export const OTHER_SOCIALS_MAX = 10

// "None yet" wins over any half-filled entries left behind: they are dropped before checking,
// so hidden fields never hold the step up
const noneYet = (value: unknown) =>
  value &&
  typeof value === 'object' &&
  (value as { recognitionNone?: unknown }).recognitionNone === true
    ? { ...value, recognition: [] }
    : value

export const practiceSchema = z.preprocess(
  noneYet,
  z
    .object({
      mediums: z
        .array(z.enum(values(MEDIUMS)))
        .min(1, 'Please choose at least one.')
        .max(MEDIUMS.length),
      mediumOther: optionalText(80),
      stylesThemes: description(
        MIN_LENGTH.general,
        500,
        'Please tell us a little about the styles and themes in your work.',
      ),
      yearsPractising: z.coerce
        .number({ error: 'Please choose how many years.' })
        .int('Please choose how many years.')
        .min(0, 'Please choose how many years.')
        .max(YEARS_PRACTISING_MAX, 'Please choose how many years.'),
      training: optionalText(1000),
      bio: description(MIN_LENGTH.bio, BIO_LIMIT, 'Please write a short biography.'),
      statement: optionalText(2000),
      website: optionalUrl,
      instagram: z
        .string()
        .trim()
        .optional()
        .transform((v, ctx) => {
          if (!v) return undefined
          const url = instagramUrl(v)
          if (!url) {
            ctx.addIssue({
              code: 'custom',
              message: 'Please give your Instagram handle, e.g. @yourname.',
            })
            return z.NEVER
          }
          return url
        }),
      facebook: z
        .string()
        .trim()
        .optional()
        .transform((v, ctx) => {
          if (!v) return undefined
          const url = facebookUrl(v)
          if (!url) {
            ctx.addIssue({
              code: 'custom',
              message: 'Please give the link to your Facebook page, or your username.',
            })
            return z.NEVER
          }
          return url
        }),
      otherSocials: z
        .array(
          z.object({
            platform: text(60, 'Please name the platform.'),
            handle: text(200, 'Please add your link or ID.'),
          }),
        )
        .max(OTHER_SOCIALS_MAX, `Up to ${OTHER_SOCIALS_MAX}, please.`)
        .default([]),
      priceRange: z.enum(values(PRICE_RANGES), { error: 'Please choose a price range.' }),
      recognition: z
        .array(
          z.object({
            kind: z.enum(values(RECOGNITION_KINDS)),
            title: text(160, 'Please give its name.'),
            venue: text(160, 'Please say where it was.'),
            year: z.coerce
              .number({ error: 'Please choose the year.' })
              .int('Please choose the year.')
              .min(thisYear - YEARS_BACK, 'Please choose the year.')
              .max(thisYear + 1, 'Please choose the year.'),
            details: description(
              MIN_LENGTH.general,
              DETAILS_LIMIT,
              'Please say a little about it, and what you showed or won.',
            ),
          }),
        )
        .max(20, 'Twenty is plenty: please choose the ones that matter most.')
        .default([]),
      // Said plainly instead of leaving the section empty
      recognitionNone: z.boolean().default(false),
    })
    .superRefine((value, ctx) => {
      if (!value.recognitionNone && value.recognition.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['recognition'],
          message: 'Please add at least one, or choose "None yet".',
        })
      }
      if (value.mediums.includes('other') && !value.mediumOther) {
        ctx.addIssue({
          code: 'custom',
          path: ['mediumOther'],
          message: 'Please say which other medium.',
        })
      }
    }),
)

export const PORTFOLIO_MIN = 3
export const PORTFOLIO_MAX = 10

export const DIMENSION_UNITS = [
  { value: 'cm', label: 'cm', cm: 1 },
  { value: 'in', label: 'inches', cm: 2.54 },
  { value: 'm', label: 'metres', cm: 100 },
] as const

/** A measurement as typed: decimals welcome, with a comma or a point */
const size = (message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().replace(',', '.') : v),
    z.coerce
      .number({ error: message })
      .positive(message)
      .max(100_000, 'Please check this measurement.'),
  )

export const toCm = (value: number, unit: (typeof DIMENSION_UNITS)[number]['value']) =>
  Math.round(value * DIMENSION_UNITS.find((u) => u.value === unit)!.cm * 100) / 100

/** Twenty metres either way is the largest work we can take */
const MAX_CM = 2000

const portfolioWorkFields = z.object({
  image: z.coerce.number({ error: 'Please add a picture of this work.' }).int().positive(),
  title: text(160, 'Please give the work a title.'),
  year: z.coerce
    .number({ error: 'Please choose the year.' })
    .int('Please choose the year.')
    .min(thisYear - YEARS_BACK, 'Please choose the year.')
    .max(thisYear, 'Please choose the year.'),
  medium: text(120, 'Please give the medium, e.g. oil on canvas.'),
  // As the artist gave them, in their unit; the centimetre values are worked out below
  unit: z.enum(values(DIMENSION_UNITS), { error: 'Please choose a unit.' }).default('cm'),
  width: size('Please give the width.'),
  height: size('Please give the height.'),
  depth: size('Please give the depth.')
    .optional()
    .or(z.literal('').transform(() => undefined))
    .or(z.null().transform(() => undefined)),
  // What the artist would sell it for; empty if it is not for sale
  priceInr: z.coerce
    .number({ error: 'Please give the price in rupees, as a number.' })
    .int('Please give the price in whole rupees.')
    .positive('Please give the price in rupees, as a number.')
    .max(1e9, 'Please check the price.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export const portfolioWorkSchema = portfolioWorkFields
  .transform((work) => ({
    ...work,
    widthCm: toCm(work.width, work.unit),
    heightCm: toCm(work.height, work.unit),
    depthCm: work.depth === undefined ? undefined : toCm(work.depth, work.unit),
  }))
  .superRefine((work, ctx) => {
    for (const key of ['width', 'height', 'depth'] as const) {
      const cm = work[`${key}Cm`]
      if (cm !== undefined && cm > MAX_CM) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Please check this measurement.' })
      }
    }
  })

export const portfolioSchema = z.object({
  works: z
    .array(portfolioWorkSchema)
    .min(PORTFOLIO_MIN, `Please add at least ${PORTFOLIO_MIN} works.`)
    .max(PORTFOLIO_MAX, `Please choose up to ${PORTFOLIO_MAX} works.`),
})

export const declarationsSchema = z.object({
  originalWork: z.literal(true, { error: 'Please confirm the work is your own.' }),
  accurate: z.literal(true, { error: 'Please confirm the information is accurate.' }),
  consentProcessing: z.literal(true, {
    error: 'We need your consent to process your details for verification and payouts.',
  }),
  // Asked for only while terms are published (src/members/terms.ts), and checked there
  agreeTerms: z.boolean().optional(),
  agreeTyped: z.string().trim().max(40).optional(),
})

/**
 * The artist's steps, in order. Identity details (kyc) have their own endpoint and their
 * own checks (src/kyc), so the generic step saver refuses that step and its schema here is empty.
 */
export const ARTIST_STEPS = ['about', 'address', 'practice', 'portfolio', 'kyc', 'review'] as const
export type ArtistStep = (typeof ARTIST_STEPS)[number]

export const ARTIST_STEP_SCHEMAS = {
  about: aboutSchema,
  address: addressStepSchema,
  practice: practiceSchema,
  portfolio: portfolioSchema,
  kyc: z.object({}),
  review: declarationsSchema,
} as const

/* ─── Partner ────────────────────────────────────────────────────────────── */

export const PARTNER_SUBTYPES: Record<(typeof PARTNER_CATEGORIES)[number]['value'], string[]> = {
  placement: [
    'Curator',
    'Art dealer / art consultant',
    'Interior designer',
    'Decorator',
    'Architect',
    'Stylist',
    'Other',
  ],
  'design-technology': ['Designer', 'Engineer', 'Photographer', 'Writer', 'Other'],
  partnership: [
    'Gallery',
    'Art dealer / art consultant',
    'Institution',
    'Business',
    'Retail client',
    'Hospitality',
    'Other',
  ],
}

export const partnerSchema = z
  .object({
    category: z.enum(values(PARTNER_CATEGORIES), {
      error: 'Please choose how you would like to work with us.',
    }),
    subType: text(60, 'Please choose what best describes you.'),
    fullName: text(120, 'Please give your full name.'),
    organisation: optionalText(160),
    role: text(120, 'Please tell us your role.'),
    phone,
    city: text(80, 'Please add your city.'),
    state: text(80, 'Please choose your state.'),
    website: optionalUrl,
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .refine(
        (v) => !v || isGstin(v),
        'That GSTIN does not look right. It has 15 characters, e.g. 01ABCDE1234F1Z5.',
      )
      .transform((v) => (v ? v : undefined)),
    interest: text(600, 'Please tell us what you would like to do together.'),
    message: text(2000, 'A few lines about yourself, please.'),
  })
  .superRefine((value, ctx) => {
    if (!PARTNER_SUBTYPES[value.category]?.includes(value.subType)) {
      ctx.addIssue({ code: 'custom', path: ['subType'], message: 'Please choose from the list.' })
    }
  })

/* ─── Errors ─────────────────────────────────────────────────────────────── */

/** zod issues as { "residence.postalCode": "A PIN code is six digits" }, the first per field */
export const fieldErrors = (error: z.ZodError): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form'
    out[key] ??= issue.message
  }
  return out
}
