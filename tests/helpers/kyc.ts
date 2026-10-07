import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { deleteEncrypted } from '@/kyc/documentStore'
import { execute } from '@/utilities/sql'
import sharp from 'sharp'

/*
 * KYC details for tests. Every value is made up: the PAN, IFSC and account number have the right
 * shape and belong to nobody (the IFSC's bank code, TEST, does not exist).
 */
export const FAKE = {
  pan: 'ABCPE1234F',
  panName: 'Asha Example',
  holderName: 'Asha Example',
  account: '999900004821',
  ifsc: 'TEST0000001',
  newAccount: '888800007733',
} as const

export const goodKyc = (documents: Record<string, number> = {}) => ({
  consent: true,
  pan: FAKE.pan,
  panName: FAKE.panName,
  // The other-ID path by default; tests of the e-Aadhaar path set idChoice themselves
  idChoice: 'other',
  otherIdKind: 'passport',
  addressOnIdMatches: true,
  documents,
})

/** Payout details, as an approved artist adds them from their account; never with the application */
export const goodBank = (account: string = FAKE.account) => ({
  holderName: FAKE.holderName,
  accountNumber: account,
  accountNumberConfirm: account,
  ifsc: FAKE.ifsc,
  bankName: 'Example Bank',
  branchName: 'Example Branch',
  accountType: 'savings' as const,
})

/** A made-up "photo of me holding the code": a plain image, as the upload re-encodes pictures */
export const identityPhotoBytes = () =>
  sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 180, b: 150 } },
  })
    .jpeg()
    .toBuffer()

/** Removes the KYC of every member whose email matches, files included */
export const removeKycFor = async (payload: Payload, emailLike: string) => {
  const files = await execute<{ storage_key: string }>(
    payload,
    sql`SELECT storage_key FROM kyc_documents WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${emailLike})`,
  )
  for (const { storage_key } of files) await deleteEncrypted(storage_key).catch(() => undefined)
  await execute(
    payload,
    sql`DELETE FROM kyc_records WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${emailLike})`,
  )
  await execute(
    payload,
    sql`DELETE FROM kyc_documents WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${emailLike})`,
  )
}
