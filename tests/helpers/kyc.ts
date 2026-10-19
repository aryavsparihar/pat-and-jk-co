import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { deleteEncrypted } from '@/kyc/documentStore'
import { identityFingerprint } from '@/kyc/identityCode'
import { storeKycDocument } from '@/kyc/service'
import { PRIVACY_NOTICE_VERSION } from '@/members/application'
import type { Member } from '@/payload-types'
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
  // The privacy notice read to its end, then I AGREE typed out
  consentReadToEnd: true,
  consentTyped: 'I AGREE',
  noticeVersion: PRIVACY_NOTICE_VERSION,
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

/** A made-up code, as the server would have given it ten minutes before it ran out */
export const FAKE_CODE = 'K7Q-4MX'

/**
 * The photos every artist's identity step needs: their PAN card, and the photo of them holding the
 * paper, taken with a code for the name on their PAN and their date of birth
 */
export const identityPhotos = async (
  payload: Payload,
  member: Member,
  { dateOfBirth, name = FAKE.panName }: { dateOfBirth: string; name?: string },
) => {
  const panCard = await storeKycDocument(payload, {
    member,
    kind: 'pan-card',
    bytes: await identityPhotoBytes(),
  })
  const now = Date.now()
  const photo = await storeKycDocument(payload, {
    member,
    kind: 'identity-photo',
    bytes: await identityPhotoBytes(),
    identity: {
      code: FAKE_CODE,
      issuedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 9 * 60_000).toISOString(),
      capturedWith: 'camera',
      fingerprint: identityFingerprint(name, dateOfBirth),
    },
  })
  return { 'pan-card': panCard.id, 'identity-photo': photo.id }
}

/** A partner's identity details: the PAN, the name on it, and the two photos (partnerKycSchema) */
export const goodPartnerKyc = (documents: Record<string, number> = {}) => ({
  consent: true,
  consentReadToEnd: true,
  consentTyped: 'I AGREE',
  noticeVersion: PRIVACY_NOTICE_VERSION,
  pan: FAKE.pan,
  panName: FAKE.panName,
  documents,
})
