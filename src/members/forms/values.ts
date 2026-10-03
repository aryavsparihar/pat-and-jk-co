import type { Application } from '@/payload-types'

import type { ArtistStep } from './schemas'

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
      return tidy({ mediums: [], recognition: [], ...app.practice }) as Record<string, unknown>
    case 'portfolio':
      return {
        works: (app.portfolio ?? []).map((work) => tidy({ ...work, image: idOf(work.image) })),
      }
    case 'kyc':
      // Never returned to the browser: the KYC step shows masked values from its own endpoint
      return {}
    case 'review':
      return tidy({
        originalWork: app.declarations?.originalWork ?? false,
        accurate: app.declarations?.accurate ?? false,
        consentProcessing: app.declarations?.consentProcessing ?? false,
      }) as Record<string, unknown>
  }
}
