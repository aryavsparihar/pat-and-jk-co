/**
 * Lists the people and records that would go in the wipe before launch (the founder's brief of
 * 25 November 2026, section 8: "Wipe all test data before launch so that every ID starts fresh").
 * It only reads: everything runs in a READ ONLY transaction, and nothing is changed or deleted.
 *
 * Each person is listed with their email address, member IDs and applications, so whoever runs
 * it can tell test accounts from real applicants before anything is agreed. Kept, and not listed:
 * staff accounts, the site's pages, posts, ventures, people and media, the settings, and the
 * security log (an audit record, which the wipe never touches).
 *
 * Run it against the database in question with the owner's connection, typed into your own
 * terminal and never pasted anywhere else:
 *
 *   read -rs DATABASE_URL && export DATABASE_URL && pnpm test-data:report; unset DATABASE_URL
 */
import 'dotenv/config'
import { Client } from 'pg'

const client = new Client({
  connectionString: process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL,
})
await client.connect()
await client.query('BEGIN READ ONLY')

const rows = async <T extends Record<string, unknown>>(text: string) =>
  (await client.query<T>(text)).rows
const count = async (table: string) =>
  Number((await rows<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`))[0]?.n ?? 0)
const day = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : '')

console.log(`Database: ${client.database} on ${client.host}\n`)

console.log('People with an account (members), oldest first')
const members = await rows<{
  id: number
  email: string | null
  standing: string | null
  artist_id: string | null
  partner_id: string | null
  created_at: Date
}>(`SELECT id, email, standing, artist_id, partner_id, created_at FROM members ORDER BY created_at`)
const applications = await rows<{
  member_id: number | null
  reference: string
  type: string
  stage: string
  curator_email: string | null
  created_at: Date
}>(
  `SELECT member_id, reference, type, stage, curator_email, created_at FROM applications ORDER BY created_at`,
)
for (const m of members) {
  const ids = [m.artist_id, m.partner_id].filter(Boolean).join(', ') || 'no member ID'
  const theirs = applications
    .filter((a) => a.member_id === m.id)
    .map((a) => `${a.reference} ${a.type} ${a.stage}`)
    .join('; ')
  console.log(
    `  ${day(m.created_at)}  ${m.email ?? '(deleted)'}  ${ids}  ${m.standing ?? ''}  ${theirs || 'no application'}`,
  )
}
if (!members.length) console.log('  none')

console.log('\nGuest curators (no account)')
const curators = applications.filter((a) => a.member_id === null)
for (const a of curators)
  console.log(`  ${day(a.created_at)}  ${a.curator_email ?? ''}  ${a.reference} ${a.stage}`)
if (!curators.length) console.log('  none')

console.log('\nRecords that go with them')
for (const [label, table] of [
  ['Applications', 'applications'],
  ['Application pictures (in private storage)', 'portfolio_images'],
  ['Identity records', 'kyc_records'],
  ['Identity documents (encrypted, in private storage)', 'kyc_documents'],
  ['Signed agreements', 'agreement_executions'],
  ['Member sign-in sessions', 'member_sessions'],
  ['Email codes waiting to be used', 'login_challenges'],
  ['Help Center tickets', 'help_tickets'],
  ['Contact and enquiry messages', 'enquiries'],
  ['Older form submissions', 'form_submissions'],
  ['Admin access requests', 'access_requests'],
  ['Rate-limit counters', 'rate_limits'],
] as const)
  console.log(`  ${label}: ${await count(table)}`)

// IDs are random, and checked against every ID ever given, a deleted person's included: the wipe
// removes those rows too, so no test ID stays taken
const held = members.filter((m) => !m.email && (m.artist_id || m.partner_id)).length
console.log(`\nMember IDs still held by deleted people (freed by the wipe): ${held}`)

console.log('\nKept, and not changed')
const [staff] = await rows<{ n: string }>(`SELECT count(*) AS n FROM users`)
console.log(`  Staff accounts: ${staff?.n}`)
console.log(`  Security log entries: ${await count('security_events')}`)
console.log('  Pages, posts, ventures, people, media and settings')

await client.query('ROLLBACK')
await client.end()
