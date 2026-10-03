import type { PhulhaarDisplay } from '@/components/phulhaar/PhulhaarPage'

/**
 * The display face for headings on Phulhaar's pages: the site's Cormorant Garamond, or Marcellus,
 * whose flared capitals echo the wordmark (docs/BRANDS.md#type). One setting; Marcellus is only
 * downloaded by a page that uses it.
 */
export const PHULHAAR_DISPLAY: PhulhaarDisplay = 'cormorant'

/** In development, ?display=marcellus or ?display=cormorant previews either; never in production */
export const phulhaarDisplayFor = (requested?: string): PhulhaarDisplay =>
  process.env.NODE_ENV === 'development' && (requested === 'marcellus' || requested === 'cormorant')
    ? requested
    : PHULHAAR_DISPLAY
