import sharp from 'sharp'
import path from 'node:path'

import { SOCIAL_PLATFORMS, socialIconSvg } from '../src/brands/socialIcons'

/**
 * Draws the email copies of the platform marks: PNG, in the letterhead's green, twice the size
 * they are shown at so they are sharp on phone screens. Run after changing src/brands/socialIcons.ts.
 */
const GREEN = '#0f2a18'
const out = path.resolve(import.meta.dirname, '../public/brand/social')

for (const platform of SOCIAL_PLATFORMS) {
  const svg = Buffer.from(socialIconSvg(platform, GREEN, 96))
  await sharp(svg, { density: 300 })
    .resize(48, 48)
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, `${platform}.png`))
  console.log(`public/brand/social/${platform}.png`)
}
