import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { deleteEncrypted } from '@/kyc/documentStore'
import { execute } from '@/utilities/sql'

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
  bank: {
    holderName: FAKE.holderName,
    accountNumber: FAKE.account,
    accountNumberConfirm: FAKE.account,
    ifsc: FAKE.ifsc,
    bankName: 'Example Bank',
    branchName: 'Example Branch',
    accountType: 'savings',
  },
  documents,
})

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
