/**
 * Makes the signed-in test artists the application load test uses (load-tests/apply.js), or
 * removes them. For the Preview database only, never production (docs/LOAD_TEST.md).
 *
 *   LOAD_TEST_DATABASE_HOST=<host> DATABASE_URL=<preview> pnpm load-test:sessions 20
 *   LOAD_TEST_DATABASE_HOST=<host> DATABASE_URL=<preview> pnpm load-test:sessions --remove
 *
 * LOAD_TEST_DATABASE_HOST must repeat the host in DATABASE_URL: typing it is the check that the
 * database is the one meant. The artists have made-up addresses at load-test.invalid, a domain
 * that can never receive email. Their session cookies go to load-tests/sessions.json (gitignored),
 * which is as good as a password for them until they are removed.
 */
if (process.env.NODE_ENV !== 'production') {
  console.error('Run this through `pnpm load-test:sessions`, which sets NODE_ENV=production.')
  process.exit(1)
}
import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { MEMBER_COOKIE } from '../src/security/constants'
import { createSession } from '../src/security/memberSession'
import { ensureApplication } from '../src/members/accounts'

const DOMAIN = 'load-test.invalid'
const OUT = new URL('../load-tests/sessions.json', import.meta.url)

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    return ''
  }
})()
if (!host || process.env.LOAD_TEST_DATABASE_HOST !== host) {
  console.error(
    `Set LOAD_TEST_DATABASE_HOST to the database host (${host || 'none found'}) to confirm it is the Preview database.`,
  )
  process.exit(1)
}

const payload = await getPayload({ config })
const ours = { email: { like: `%@${DOMAIN}` } }

if (process.argv.includes('--remove')) {
  const members = await payload.find({
    collection: 'members',
    where: ours,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const ids = members.docs.map((m) => m.id)
  if (ids.length) {
    const mine = { member: { in: ids } }
    for (const collection of ['member-sessions', 'applications'] as const) {
      await payload.delete({ collection, where: mine, overrideAccess: true })
    }
    await payload.delete({ collection: 'members', where: ours, overrideAccess: true })
  }
  writeFileSync(OUT, '[]\n')
  console.log(`Removed ${ids.length} load-test artists from ${host}.`)
  process.exit(0)
}

const count = Math.min(Math.max(Number(process.argv[2]) || 20, 1), 200)
const cookies: string[] = []
for (let i = 1; i <= count; i++) {
  const { member } = await ensureApplication(payload, {
    email: `artist-${String(i).padStart(3, '0')}@${DOMAIN}`,
    type: 'artist',
  })
  const { value } = await createSession(payload, { memberId: member.id, userAgent: 'k6 load test' })
  cookies.push(`${MEMBER_COOKIE}=${encodeURIComponent(value)}`)
}
writeFileSync(OUT, `${JSON.stringify(cookies, null, 2)}\n`)
console.log(`${count} load-test artists ready on ${host}; sessions in load-tests/sessions.json.`)
process.exit(0)
