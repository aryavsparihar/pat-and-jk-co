/**
 * A made-up approved artist, for looking at the member portal on your own computer. Works only
 * against a database on this machine, never a hosted one.
 *
 *   pnpm sample:artist          makes sample-artist@example.test an approved artist, with a
 *                               Google Drive folder link and one described work (safe to rerun)
 *   pnpm sample:artist code     after asking for a code at /collaborate/signin with that address,
 *                               gives that request a new code and prints it: the email itself goes
 *                               nowhere, as example.test has no inbox
 */
import 'dotenv/config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import { createArtwork } from '../src/members/artworks'
import { ensureApplication } from '../src/members/accounts'
import config from '../src/payload.config'
import { createOtp, hashOtp } from '../src/security/otp'
import { execute } from '../src/utilities/sql'

const EMAIL = 'sample-artist@example.test'

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    return ''
  }
})()
if (
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV ||
  !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
) {
  console.error('This only runs against a database on this computer.')
  process.exit(1)
}

const payload = await getPayload({ config })

if (process.argv[2] === 'code') {
  const [challenge] = await execute<{ id: number }>(
    payload,
    sql`SELECT id FROM login_challenges WHERE email = ${EMAIL} ORDER BY id DESC LIMIT 1`,
  )
  if (!challenge) {
    console.error(`First ask for a code at /collaborate/signin with ${EMAIL}.`)
    process.exit(1)
  }
  const code = createOtp()
  await execute(
    payload,
    sql`UPDATE login_challenges SET code_hash = ${hashOtp(code, String(challenge.id))} WHERE id = ${challenge.id}`,
  )
  console.log(`Your code: ${code}`)
  process.exit(0)
}

const { member } = await ensureApplication(payload, { email: EMAIL, type: 'artist' })
let artist = member
if (!member.artistId) {
  artist = await payload.update({
    collection: 'members',
    id: member.id,
    data: { artistId: `AT9${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}` },
    overrideAccess: true,
    context: { issuingMemberId: 'artistId', disableRevalidate: true },
  })
}
if (!artist.worksFolder) {
  artist = await payload.update({
    collection: 'members',
    id: member.id,
    data: { worksFolder: 'https://drive.google.com/drive/folders/1SampleFolderForLookingAround' },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
}
const works = await payload.count({
  collection: 'artworks',
  where: { owner: { equals: member.id } },
  overrideAccess: true,
})
if (!works.totalDocs) {
  await createArtwork(payload, artist, {
    title: 'River at Dusk',
    year: 2024,
    medium: 'Oil',
    surface: 'Canvas',
    widthCm: 60,
    heightCm: 90,
    forSale: true,
    priceInr: 45000,
    availability: 'available',
    description:
      'The river below the town at dusk, painted outdoors over three evenings in early winter, in oil on a primed canvas.',
  } as Parameters<typeof createArtwork>[2])
}
console.log(`${EMAIL} is an approved artist (${artist.artistId}).`)
console.log('Sign in at http://localhost:3000/collaborate/signin, then run `pnpm sample:artist code`.')
process.exit(0)
