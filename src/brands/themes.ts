import { PHULHAAR_BREATHE, PHULHAAR_DISPLAY } from './phulhaar'

/**
 * How a venture's own pages look: its row on the ventures index and its venture page. Chosen per
 * venture in the CMS (Ventures → Theme); empty means PJK's own editorial style. A new brand gets a
 * look by adding an entry here and its tokens in globals.css (docs/ADDING_A_BRAND.md), not by
 * special cases in the components.
 */

export const VENTURE_THEME_OPTIONS = [
  { label: 'PJK (the default)', value: 'pjk' },
  { label: 'Phulhaar', value: 'phulhaar' },
] as const

export type VentureThemeName = (typeof VENTURE_THEME_OPTIONS)[number]['value']

export type VentureTheme = {
  name: VentureThemeName
  /** Puts a page or a row in the brand's palette and type (globals.css) */
  className: string
  /** A decorative rule in the brand's colours, drawn above its index row and its notices */
  ruleClassName?: string
  /** The display face for headings, read by globals.css as data-display */
  display?: string
  /** A small form of the brand's mark for the index row; always on the brand's own ground */
  emblem?: { src: string; width: number; height: number }
  /** The mark on the venture page breathes slowly (still under prefers-reduced-motion) */
  breathe?: boolean
  /** A way in for the people the brand works with, shown on its venture page */
  invite?: {
    label: string
    heading: string
    href: string
    open: string
    closed: string
    action: { open: string; closed: string }
  }
}

const THEMES: Record<Exclude<VentureThemeName, 'pjk'>, VentureTheme> = {
  phulhaar: {
    name: 'phulhaar',
    className: 'brand-theme phulhaar',
    ruleClassName: 'phulhaar-rule',
    display: PHULHAAR_DISPLAY,
    emblem: { src: '/brand/ventures/phulhaar-garland.webp', width: 795, height: 1200 },
    breathe: PHULHAAR_BREATHE,
    invite: {
      label: 'For artists',
      heading: 'Show your work with Phulhaar',
      href: '/collaborate/artists',
      open: 'Applications are open. Tell us about your practice and send a few pictures of your work; you can stop and come back at any time.',
      closed:
        'Applications open soon. See what we ask for and what to have ready, and come back when they open.',
      action: { open: 'Apply as an artist', closed: 'See how to apply' },
    },
  },
}

/** The theme a venture asks for, or null for PJK's own style */
export const ventureTheme = (venture: { theme?: string | null }): VentureTheme | null =>
  venture.theme && venture.theme in THEMES ? THEMES[venture.theme as keyof typeof THEMES] : null
