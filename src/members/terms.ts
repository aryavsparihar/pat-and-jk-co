import type { Payload } from 'payload'

/**
 * The artists' Terms & Conditions: a PDF uploaded in Site settings → Applications. While one is
 * there, an artist must tick that they agree and type I AGREE before sending; which document they
 * agreed to is kept with their application. Without one, nothing is asked.
 */

export type ArtistTerms = { id: number; url: string; filename: string }

export const TERMS_PHRASE = 'I AGREE'

/** Typed as asked: the words I AGREE, whatever the capitals or spacing */
export const agreedInWords = (typed: unknown): boolean =>
  typeof typed === 'string' && typed.trim().replace(/\s+/g, ' ').toUpperCase() === TERMS_PHRASE

export const artistTerms = async (payload: Payload): Promise<ArtistTerms | null> => {
  const settings = (
    await payload.find({
      collection: 'site-settings',
      where: { 'tenant.slug': { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })
  ).docs[0] as
    | {
        artistTerms?: { id: number; url?: string | null; filename?: string | null } | number | null
      }
    | undefined
  const file = settings?.artistTerms
  if (!file || typeof file !== 'object' || !file.url) return null
  return { id: file.id, url: file.url, filename: file.filename ?? 'terms.pdf' }
}
