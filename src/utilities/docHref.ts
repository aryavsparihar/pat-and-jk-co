/**
 * Public URL path for a document. The single source of truth for URL structure:
 *   pages    → /<slug>  (the "home" page is /)
 *   posts    → /journal/<slug>
 *   ventures → /ventures/<slug>
 */
export const docPath = (collection: string, slug?: string | null): string => {
  if (!slug) return '/'
  const encoded = encodeURIComponent(slug)
  switch (collection) {
    case 'posts':
      return `/journal/${encoded}`
    case 'ventures':
      return `/ventures/${encoded}`
    default:
      return slug === 'home' ? '/' : `/${encoded}`
  }
}

type Reference = {
  relationTo: string
  value: unknown
} | null

/** Resolves a Payload link reference (relationship with `relationTo` + populated `value`) to a path. */
export const referenceHref = (reference?: Reference): string | null => {
  if (!reference || typeof reference.value !== 'object' || !reference.value) return null
  const slug = (reference.value as { slug?: string | null }).slug
  if (!slug) return null
  return docPath(reference.relationTo, slug)
}
