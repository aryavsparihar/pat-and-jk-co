/**
 * Checks, read-only, that the records the live site needs are there (src/health/content.ts).
 *
 *   pnpm check:content                    against DATABASE_URL in .env
 *   DATABASE_URL=… pnpm check:content     against another database, production included
 *
 * Always in production mode (the package script sets NODE_ENV): in development mode Payload would
 * push schema changes to whatever database it is pointed at, production included.
 */
if (process.env.NODE_ENV !== 'production') {
  console.error('Run this through `pnpm check:content`, which sets NODE_ENV=production.')
  process.exit(1)
}
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { checkContent } from '../src/health/content'

const payload = await getPayload({ config })
const result = await checkContent(payload)
if (result.ok) {
  console.log(`All ${result.checked} required records are there.`)
  process.exit(0)
}
console.error(
  `Missing (${result.missing.length} of ${result.checked}):\n  ${result.missing.join('\n  ')}`,
)
process.exit(1)
