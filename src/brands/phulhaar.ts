import type { PhulhaarDisplay } from '@/components/phulhaar/PhulhaarPage'

/**
 * The display face for headings on Phulhaar's pages: the site's Cormorant Garamond, or Marcellus,
 * whose flared capitals echo the wordmark (docs/BRANDS.md#type). One setting; Marcellus is only
 * downloaded by a page that uses it.
 */
export const PHULHAAR_DISPLAY: PhulhaarDisplay = 'marcellus'

/**
 * Whether the garland breathes (a very slow, slight scale and fade; docs/BRANDS.md, rule 7). Off
 * since 7 October 2026: it read as a glitch rather than as life. True brings it back everywhere:
 * the artist pages and the Phulhaar venture page.
 */
export const PHULHAAR_BREATHE = false

/** In development, ?display=marcellus or ?display=cormorant previews either; never in production */
export const phulhaarDisplayFor = (requested?: string): PhulhaarDisplay =>
  process.env.NODE_ENV === 'development' && (requested === 'marcellus' || requested === 'cormorant')
    ? requested
    : PHULHAAR_DISPLAY
