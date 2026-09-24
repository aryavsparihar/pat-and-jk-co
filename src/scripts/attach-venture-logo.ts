/**
 * Puts a venture's own logo into the media library and attaches it, so the site stops showing
 * the typographic stand-in for that venture.
 *
 *   pnpm attach-venture-logo                                   # Phulhaar, from public/brand/ventures
 *   pnpm attach-venture-logo <slug> <file> "<alt text>"
 *
 * Run against whichever database DATABASE_URL points at. For production the upload also needs
 * BLOB_READ_WRITE_TOKEN, or the media row will point at a file that only exists on your machine
 * (`vercel env pull` fetches both). If the venture already has a logo, the file behind it is
 * replaced, so nothing that points at it has to change.
 */
import configPromise from '@payload-config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'

const [slug = 'phulhaar-gallery', file = 'public/brand/ventures/phulhaar-logo.png', altArg] =
  process.argv.slice(2)
const alt = altArg || 'Venture logo'

const payload = await getPayload({ config: configPromise })

const found = await payload.find({
  collection: 'ventures',
  where: { slug: { equals: slug } },
  limit: 1,
  depth: 1,
  overrideAccess: true,
})

const venture = found.docs[0]
if (!venture) {
  console.error(`\n✕ No venture with the slug “${slug}”.\n`)
  process.exit(1)
}

const data = readFileSync(path.resolve(process.cwd(), file))
const name = path.basename(file)
const upload = { data, mimetype: 'image/png', name, size: data.length }
const existing = venture.logo && typeof venture.logo === 'object' ? venture.logo : null

if (existing) {
  await payload.update({
    collection: 'media',
    id: existing.id,
    data: {},
    file: { ...upload, name: existing.filename ?? name },
    overrideAccess: true,
  })
  console.log(`✓ Replaced ${existing.filename} (${(data.length / 1024).toFixed(0)} kB)`)
} else {
  const media = await payload.create({
    collection: 'media',
    data: { alt, tenant: venture.tenant as never },
    file: upload,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'ventures',
    id: venture.id,
    data: { logo: media.id },
    overrideAccess: true,
  })
  console.log(`✓ Attached ${name} to ${venture.name} (${(data.length / 1024).toFixed(0)} kB)`)
}

console.log('\nThe live pages refresh by themselves.\n')
process.exit(0)
