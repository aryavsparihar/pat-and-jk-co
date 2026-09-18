/**
 * Replaces the portrait files already in the media library with the current versions in
 * public/brand/people, keeping the same media items (so the People entries, and anything else
 * pointing at them, stay linked).
 *
 *   pnpm brand:portraits public/brand/people yuvraj=~/Downloads/yuvraj.jpg …   # re-cut the photos
 *   pnpm refresh-portraits                                                      # then push them in
 *
 * The person is found by name rather than by filename, because re-seeding can leave the media
 * item with a numbered filename. Nothing else in the database is touched.
 */
import configPromise from '@payload-config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'

/** local file in public/brand/people → the person whose portrait it is */
const portraits: Record<string, string> = {
  'yuvraj.jpg': 'Yuvraj Singh Pathania',
  'aryaveer.jpg': 'Aryaveer Singh Parihar',
}

const payload = await getPayload({ config: configPromise })

for (const [localName, personName] of Object.entries(portraits)) {
  const found = await payload.find({
    collection: 'people',
    where: { name: { like: personName } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })

  const person = found.docs[0]
  const portrait = person?.portrait
  if (!portrait || typeof portrait !== 'object') {
    console.log(`– ${personName} has no portrait in the media library; skipping`)
    continue
  }

  const data = readFileSync(path.resolve(process.cwd(), 'public/brand/people', localName))

  await payload.update({
    collection: 'media',
    id: portrait.id,
    data: {},
    file: {
      data,
      mimetype: 'image/jpeg',
      name: portrait.filename ?? localName,
      size: data.length,
    },
    overrideAccess: true,
  })

  console.log(
    `✓ Updated ${portrait.filename} for ${personName} (${(data.length / 1024).toFixed(0)} kB)`,
  )
}

console.log('\nThe live pages refresh by themselves.\n')
process.exit(0)
