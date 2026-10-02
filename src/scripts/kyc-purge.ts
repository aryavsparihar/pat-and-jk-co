/**
 * Deletes KYC data that is no longer needed, as the retention policy in docs/KYC.md sets out:
 * declined applications after 90 days, applications never sent after 180 days, withdrawn consent
 * at once (unless a legal hold applies), and uploads never saved after 7 days.
 *
 *   pnpm kyc:purge            shows what would be deleted
 *   pnpm kyc:purge --apply    deletes it
 *
 * Prints counts and member numbers only, never a name or a value.
 */
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { kycPurgeCandidates, purgeKyc, purgeKycDocument } from '@/kyc/service'

const apply = process.argv.includes('--apply')
const payload = await getPayload({ config: configPromise })

const { members, orphanDocuments } = await kycPurgeCandidates(payload)

console.log(`\n${apply ? 'Deleting' : 'Would delete'} KYC for ${members.length} member(s):`)
for (const { memberId, reason } of members) {
  console.log(`  member ${memberId}: ${reason}`)
  if (apply) await purgeKyc(payload, { memberId, reason: `Retention: ${reason}` })
}
console.log(`${apply ? 'Deleting' : 'Would delete'} ${orphanDocuments.length} unsaved upload(s).`)
if (apply) for (const id of orphanDocuments) await purgeKycDocument(payload, id)

if (!apply && (members.length || orphanDocuments.length)) {
  console.log('\nNothing has been deleted. Run again with --apply to delete.\n')
}
process.exit(0)
