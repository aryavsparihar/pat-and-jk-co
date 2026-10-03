/**
 * Deletes KYC data that is no longer needed, as the retention policy in docs/KYC.md sets out:
 * declined applications after 90 days, applications never sent after 180 days, withdrawn consent
 * at once (unless a legal hold applies), and uploads never saved after 7 days.
 *
 * Production runs this weekly by itself (/next/cron/kyc-purge, vercel.json). By hand:
 *
 *   pnpm kyc:purge            shows what would be deleted
 *   pnpm kyc:purge --apply    deletes it
 *
 * Files are deleted only inside the current environment's folder (VERCEL_ENV), so a run against a
 * preview database never touches production's documents. Prints counts and member numbers only.
 */
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { kycPurgeCandidates, runKycPurge } from '@/kyc/service'

const apply = process.argv.includes('--apply')
const payload = await getPayload({ config: configPromise })

if (apply) {
  const summary = await runKycPurge(payload)
  console.log(
    `\nDeleted KYC for ${summary.members} member(s) and ${summary.documents} unsaved upload(s).` +
      (summary.failed ? ` ${summary.failed} could not be deleted and will be tried again.` : ''),
  )
  for (const [reason, count] of Object.entries(summary.reasons))
    console.log(`  ${count}: ${reason}`)
  console.log('')
  process.exit(summary.failed ? 1 : 0)
}

const { members, orphanDocuments } = await kycPurgeCandidates(payload)
console.log(`\nWould delete KYC for ${members.length} member(s):`)
for (const { memberId, reason } of members) console.log(`  member ${memberId}: ${reason}`)
console.log(`Would delete ${orphanDocuments.length} unsaved upload(s).`)
if (members.length || orphanDocuments.length) {
  console.log('\nNothing has been deleted. Run again with --apply to delete.\n')
}
process.exit(0)
