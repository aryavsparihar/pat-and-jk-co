/**
 * The platform marks shown beside social links: on the site, and as PNGs in emails (mail clients
 * do not show SVG; `pnpm social:icons` draws them from these). Simple line drawings on a 24-unit
 * grid, in the text colour, so they sit quietly beside the words rather than in each platform's
 * own colours.
 */

export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'linkedin',
  'x',
  'youtube',
  'pinterest',
] as const

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
}

/** The inside of each 24 x 24 SVG, drawn with stroke="currentColor" */
export const SOCIAL_ICON_BODY: Record<SocialPlatform, string> = {
  instagram:
    '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="0.6" fill="currentColor"/>',
  facebook:
    '<path d="M17.5 2.5h-2.8a4.6 4.6 0 0 0-4.6 4.6v3.1H7v3.9h3.1v7.4h3.9v-7.4h3l.6-3.9h-3.6V7.6a1.1 1.1 0 0 1 1.1-1.1h2.4z"/>',
  linkedin:
    '<rect x="2.5" y="2.5" width="19" height="19" rx="3.5"/><path d="M7.6 10.6v6"/><circle cx="7.6" cy="7.5" r="0.6" fill="currentColor"/><path d="M11.2 16.6v-6"/><path d="M11.2 13.4c0-1.7 1.1-2.9 2.7-2.9 1.5 0 2.5 1 2.5 2.9v3.2"/>',
  x: '<path d="M4.5 4h4.2l10.8 16h-4.2z"/><path d="M19 4l-5.8 6.6"/><path d="M10.8 13.4 5 20"/>',
  youtube:
    '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.2 9.4v5.2l4.4-2.6z"/>',
  pinterest:
    '<circle cx="12" cy="12" r="9.5"/><path d="M10.9 13.4 9.4 20.6"/><path d="M9.6 14.6c-.9-.7-1.3-1.7-1.3-2.8 0-2.6 2-4.6 4.6-4.6 2.4 0 4 1.6 4 3.8 0 2.6-1.4 4.6-3.4 4.6-1.1 0-1.9-.8-1.7-1.9l.8-3.2"/>',
}

export const socialIconSvg = (platform: SocialPlatform, color = 'currentColor', size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" color="${color}">${SOCIAL_ICON_BODY[platform]}</svg>`

/** Whether a platform has a mark here (Behance and "Other" are shown by name alone) */
export const hasSocialIcon = (platform: string): platform is SocialPlatform =>
  (SOCIAL_PLATFORMS as readonly string[]).includes(platform)

/** The set links, in a fixed order, from Site settings → Contact & social → Phulhaar */
export const phulhaarSocialLinks = (
  group: Partial<Record<SocialPlatform, string | null>> | null | undefined,
): { platform: SocialPlatform; label: string; url: string }[] =>
  SOCIAL_PLATFORMS.flatMap((platform) => {
    const url = group?.[platform]?.trim()
    return url && /^https:\/\//i.test(url)
      ? [{ platform, label: SOCIAL_LABELS[platform], url }]
      : []
  })
