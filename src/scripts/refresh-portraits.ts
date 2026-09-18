/**
 * Replaces the portrait files already in the media library with the current versions in
 * public/brand/people, keeping the same media items (so the People entries, and anything else
 * pointing at them, stay linked).
 *
 *   pnpm brand:portraits public/brand/people yuvraj=~/Downloads/yuvraj.jpg …   # re-cut the photos
 *   pnpm refresh-portraits                                                      # then push them in
 *
 * Nothing else in the database is touched.
 */
import configPromise from '@payload-config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'

/** local file in public/brand/people → the filename it has in the media library */
const portraits: Record<string, string> = {
  'yuvraj.jpg': 'yuvraj-singh-pathania.jpg',
  'aryaveer.jpg': 'aryaveer-singh-parihar.jpg',
}

const payload = await getPayload({ config: configPromise })

for (const [localName, mediaFilename] of Object.entries(portraits)) {
  const found = await payload.find({
    collection: 'media',
    where: { filename: { equals: mediaFilename } },
    limit: 1,
    overrideAccess: true,
  })

  const existing = found.docs[0]
  if (!existing) {
    console.log(`– ${mediaFilename} is not in the media library; skipping`)
    continue
  }

  const data = readFileSync(path.resolve(process.cwd(), 'public/brand/people', localName))

  await payload.update({
    collection: 'media',
    id: existing.id,
    data: {},
    file: { data, mimetype: 'image/jpeg', name: mediaFilename, size: data.length },
    overrideAccess: true,
  })

  console.log(`✓ Updated ${mediaFilename} (${(data.length / 1024).toFixed(0)} kB)`)
}

console.log('\nThe live pages refresh by themselves.\n')
process.exit(0)
