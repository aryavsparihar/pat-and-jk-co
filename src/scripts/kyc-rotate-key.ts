/**
 * Moves KYC records onto a new master key, without decrypting or re-encrypting the data itself:
 * only each record's and document's data key is re-wrapped.
 *
 * 1. Generate a new key:                 openssl rand -base64 32
 * 2. Set KYC_ENCRYPTION_KEY_PREVIOUS to the old key and KYC_ENCRYPTION_KEY to the new one,
 *    in Vercel and wherever you run this. Redeploy. Both keys now work.
 * 3. pnpm kyc:rotate-key                 shows how many would move
 *    pnpm kyc:rotate-key --apply         moves them
 * 4. When it reports nothing left and nothing failed, remove KYC_ENCRYPTION_KEY_PREVIOUS and
 *    redeploy. Keep the old key offline until the next database backup has rolled over.
 *
 * Safe to run more than once. Prints counts only.
 */
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { rotateKycKeys } from '@/kyc/service'

const apply = process.argv.includes('--apply')
const payload = await getPayload({ config: configPromise })

const result = await rotateKycKeys(payload, { apply })

console.log(
  [
    '',
    `Current key: ${result.current}`,
    `${apply ? 'Re-wrapped' : 'Would re-wrap'}: ${result.records} record(s), ${result.documents} document(s)`,
    `Could not open: ${result.failed}${result.failed ? ' (is KYC_ENCRYPTION_KEY_PREVIOUS set to the old key?)' : ''}`,
    apply ? '' : '\nNothing has changed. Run again with --apply.\n',
  ].join('\n'),
)
process.exit(result.failed ? 1 : 0)
