/**
 * Moves every artist's picture still kept in the old public place into the private store
 * (src/storage/memberMediaAdapter.ts). Each also moves by itself the first time it is asked for;
 * this does the rest at once. Lists what it would move, and moves only with --apply.
 *
 *   pnpm media:make-private              against DATABASE_URL in .env, listing only
 *   pnpm media:make-private --apply      and moving them
 *
 * On Vercel the private store is reached with the deployment's OIDC token, so run it where that is
 * available (`vercel env pull` gives one for an hour), with the production DATABASE_URL.
 */
if (process.env.NODE_ENV !== 'production') {
  console.error('Run this through `pnpm media:make-private`, which sets NODE_ENV=production.')
  process.exit(1)
}
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { makeImagePrivate, portfolioFolder } from '../src/storage/memberMediaAdapter'

const apply = process.argv.includes('--apply')
const payload = await getPayload({ config })
const waiting = await payload.find({
  collection: 'portfolio-images',
  where: {
    or: [{ prefix: { exists: false } }, { prefix: { not_like: `${portfolioFolder()}%` } }],
  },
  limit: 0,
  pagination: false,
  depth: 0,
  overrideAccess: true,
})
console.log(`${waiting.docs.length} picture(s) still in the old public place.`)
if (!apply) {
  if (waiting.docs.length) console.log('Run again with --apply to move them.')
  process.exit(0)
}
let moved = 0
for (const doc of waiting.docs) {
  try {
    if (await makeImagePrivate(payload, doc)) moved++
  } catch (error) {
    console.error(`Picture ${doc.id} could not be moved: ${(error as Error).message}`)
  }
}
console.log(`Moved ${moved} of ${waiting.docs.length}.`)
process.exit(moved === waiting.docs.length ? 0 : 1)
