/**
 * The three kinds of partner. The values are fixed (they are stored); the words that describe
 * each one to visitors live in the CMS, on the collaborate pages, so they can be reworded freely.
 */
export const PARTNER_CATEGORIES = [
  { value: 'placement', label: 'Curators, interior designers and decorators' },
  { value: 'design-technology', label: 'Designers and engineers' },
  { value: 'partnership', label: 'Partners' },
] as const

export type PartnerCategory = (typeof PARTNER_CATEGORIES)[number]['value']
