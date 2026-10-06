import { z } from 'zod'

import { PARTNER_CATEGORIES } from '../categories'
import { STATES_AND_TERRITORIES } from './india'
import { ageOn, instagramUrl, isGstin, isPin, isWebUrl, toE164 } from './validators'

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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined))

const phone = z
  .string({ error: 'Please add a phone number.' })
  .trim()
  .transform((value, ctx) => {
    const e164 = toE164(value)
    if (!e164) {
      ctx.addIssue({
        code: 'custom',
        message:
          'That number does not look complete. Include the country code if it is not Indian, e.g. +44 20 7946 0000.',
      })
      return z.NEVER
    }
    return e164
  })

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || isWebUrl(v), 'Please use a full web address, e.g. https://example.com')
  .transform((v) => (v ? v : undefined))

const thisYear = new Date().getUTCFullYear()

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

export const addressSchema = z
  .object({
    line1: text(120, 'Please add the first line of your address.'),
    line2: optionalText(120),
    landmark: optionalText(120),
    city: text(80, 'Please add your city or town.'),
    district: text(80, 'Please add your district.'),
    state: text(80, 'Please choose your state.'),
    postalCode: text(12, 'Please add your PIN code.'),
    country: text(60).default('India'),
  })
  .superRefine((value, ctx) => {
    const india = /^(india|bharat)$/i.test(value.country)
    if (india && !(STATES_AND_TERRITORIES as readonly string[]).includes(value.state)) {
      ctx.addIssue({
        code: 'custom',
        path: ['state'],
        message: 'Please choose your state from the list.',
      })
    }
    if (india && !isPin(value.postalCode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['postalCode'],
        message: 'A PIN code is six digits, e.g. 184101.',
      })
    }
  })

export const addressStepSchema = z
  .object({
    residence: addressSchema,
    correspondenceSame: z.boolean().default(true),
    correspondence: z.unknown().optional(),
  })
  .transform((value, ctx) => {
    if (value.correspondenceSame) return { ...value, correspondence: undefined }
    const parsed = addressSchema.safeParse(value.correspondence ?? {})
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ['correspondence', ...issue.path] } as never)
      }
      return z.NEVER
    }
    return { ...value, correspondence: parsed.data }
  })

export const MEDIUMS = [
  { value: 'painting', label: 'Painting' },
  { value: 'drawing', label: 'Drawing' },
  { value: 'printmaking', label: 'Printmaking' },
  { value: 'sculpture', label: 'Sculpture' },
  { value: 'photography', label: 'Photography' },
  { value: 'textile', label: 'Textile' },
  { value: 'mixed-media', label: 'Mixed media' },
  { value: 'digital', label: 'Digital' },
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

export const practiceSchema = z
  .object({
    mediums: z
      .array(z.enum(values(MEDIUMS)))
      .min(1, 'Please choose at least one medium.')
      .max(9),
    mediumOther: optionalText(80),
    stylesThemes: text(500, 'A few words about the styles and themes you work with.'),
    yearsPractising: z.coerce
      .number({ error: 'Please give a number of years.' })
      .int('Whole years, please.')
      .min(0, 'Please give a number of years.')
      .max(80, 'Please check the number of years.'),
    training: optionalText(1000),
    bio: z
      .string({ error: 'Please write a short biography.' })
      .trim()
      .min(80, 'A few sentences, please: at least 80 characters.')
      .max(BIO_LIMIT, `Please keep your biography under ${BIO_LIMIT} characters.`),
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
    priceRange: z.enum(values(PRICE_RANGES), { error: 'Please choose a price range.' }),
    recognition: z
      .array(
        z.object({
          kind: z.enum(values(RECOGNITION_KINDS)),
          title: text(160, 'Please name the exhibition or award.'),
          venue: optionalText(160),
          year: z.coerce
            .number({ error: 'Please give a year.' })
            .int()
            .min(1950, 'Please check the year.')
            .max(thisYear + 1, 'Please check the year.'),
        }),
      )
      .max(20, 'Twenty is plenty: please choose the ones that matter most.')
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mediums.includes('other') && !value.mediumOther) {
      ctx.addIssue({
        code: 'custom',
        path: ['mediumOther'],
        message: 'Please say which other medium.',
      })
    }
  })

export const PORTFOLIO_MIN = 3
export const PORTFOLIO_MAX = 10

export const portfolioWorkSchema = z.object({
  image: z.coerce.number({ error: 'Please add a picture of this work.' }).int().positive(),
  title: text(160, 'Please give the work a title.'),
  year: z.coerce
    .number({ error: 'Please give the year.' })
    .int()
    .min(1900, 'Please check the year.')
    .max(thisYear, 'Please check the year.'),
  medium: text(120, 'Please give the medium, e.g. oil on canvas.'),
  widthCm: z.coerce
    .number({ error: 'Width in centimetres.' })
    .positive('Width in centimetres.')
    .max(2000),
  heightCm: z.coerce
    .number({ error: 'Height in centimetres.' })
    .positive('Height in centimetres.')
    .max(2000),
  depthCm: z.coerce
    .number()
    .positive()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
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
  placement: ['Curator', 'Interior designer', 'Decorator', 'Architect', 'Stylist', 'Other'],
  'design-technology': ['Designer', 'Engineer', 'Photographer', 'Writer', 'Other'],
  partnership: ['Gallery', 'Institution', 'Business', 'Retail client', 'Hospitality', 'Other'],
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
