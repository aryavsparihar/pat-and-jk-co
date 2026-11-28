import type { Application } from '@/payload-types'

import { experienceBand, type ArtistStep } from './schemas'

/**
 * A stored application, put back into the shape each step's form (and schema) works with. Shared by
 * the server, which re-checks stored steps before an application is sent, and the browser, which
 * fills the forms when an applicant comes back.
 */

const idOf = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : v)

/** Payload returns null for empty optional fields, and an id on array rows; forms want neither */
export const tidy = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(tidy)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, v]) => v !== null && key !== 'id')
        .map(([key, v]) => [key, tidy(v)]),
    )
  }
  return value
}

export const stepValues = (
  step: ArtistStep,
  app: Partial<Application>,
): Record<string, unknown> => {
  switch (step) {
    case 'about':
      return tidy({ ...app.about, dateOfBirth: app.about?.dateOfBirth?.slice(0, 10) }) as Record<
        string,
        unknown
      >
    case 'address':
      return tidy({
        residence: { country: 'India', ...app.address?.residence },
        correspondenceSame: app.address?.correspondenceSame ?? true,
        correspondence:
          app.address?.correspondenceSame === false ? app.address?.correspondence : undefined,
      }) as Record<string, unknown>
    case 'practice':
      return tidy({
        mediums: [],
        recognition: [],
        otherSocials: [],
        recognitionNone: false,
        ...app.practice,
        // A number of years given before the bands is shown as the band it falls in
        yearsPractising: experienceBand(app.practice?.yearsPractising),
      }) as Record<string, unknown>
    case 'portfolio':
      return {
        works: (app.portfolio ?? []).map((work) => {
          // Works saved before units were asked for were in centimetres, and metres are no
          // longer offered: both come back in centimetres
          const inCm = !work.unit || work.unit === 'm'
          return tidy({
            ...work,
            image: idOf(work.image),
            unit: inCm ? 'cm' : work.unit,
            width: inCm ? (work.widthCm ?? work.width) : work.width,
            height: inCm ? (work.heightCm ?? work.height) : work.height,
            depth: inCm ? (work.depthCm ?? work.depth) : work.depth,
            widthCm: undefined,
            heightCm: undefined,
            depthCm: undefined,
            // A saved work with no price was saved as not for sale
            forSale: typeof work.priceInr === 'number',
          })
        }),
      }
    case 'review':
      return tidy({
        originalWork: app.declarations?.originalWork ?? false,
        notCopy: app.declarations?.notCopy ?? false,
        accurate: app.declarations?.accurate ?? false,
      }) as Record<string, unknown>
  }
}
