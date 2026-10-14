import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import type { Payload, Where } from 'payload'
import sharp from 'sharp'

import type { KycDocument, KycRecord, Member, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'

import {
  blindIndex,
  masterKeys,
  newDataKey,
  openField,
  openFile,
  rewrapDataKey,
  sealField,
  sealFile,
  unwrapDataKey,
  wrapDataKey,
} from './crypto'
import { checkMaskedAadhaar, type AadhaarCheck } from './aadhaarCheck'
import { deleteEncrypted, kycPrefix, readEncrypted, storeEncrypted } from './documentStore'
import { AADHAAR_CHECK_MODE } from './settings'
import type { BankInput, KycDocumentKind, KycInput } from './schema'
import { maskAadhaar, maskAccount, maskIfsc, maskPan, namesPlausiblyMatch } from './values'

/**
 * Everything that reads or writes KYC data goes through here; nothing else imports the crypto.
 *
 * Contexts bind each ciphertext to its member and field ("member:12:pan"), so a value cannot be
 * moved between members or fields. A pending bank change is sealed with the same contexts as the
 * current details, so approving it moves ciphertext across without ever decrypting it.
 */

export class KycError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}

const recordContext = (memberId: number) => `member:${memberId}`
const fieldContext = (memberId: number, field: string) => `member:${memberId}:${field}`

const SEALED_FIELDS = [
  'pan',
  'panName',
  'aadhaarLast4',
  'accountNumber',
  'ifsc',
  'holderName',
  'branchName',
] as const
type SealedField = (typeof SEALED_FIELDS)[number]

const COLUMN: Record<SealedField, keyof KycRecord> = {
  pan: 'panSealed' as never,
  panName: 'panNameSealed' as never,
  aadhaarLast4: 'aadhaarLast4Sealed' as never,
  accountNumber: 'accountNumberSealed' as never,
  ifsc: 'ifscSealed' as never,
  holderName: 'holderNameSealed' as never,
  branchName: 'branchNameSealed' as never,
}

const findRecord = async (payload: Payload, memberId: number): Promise<KycRecord | null> => {
  const found = await payload.find({
    collection: 'kyc-records',
    where: { member: { equals: memberId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  return found.docs[0] ?? null
}

/** The record's data key: unwrapped if it exists, or a fresh one with its wrapped form */
const dataKeyFor = (record: KycRecord | null, memberId: number) => {
  const sealedRecord = record as (KycRecord & { keyId?: string; wrappedKey?: string }) | null
  if (sealedRecord?.keyId && sealedRecord.wrappedKey) {
    return {
      key: unwrapDataKey(
        { keyId: sealedRecord.keyId, wrappedKey: sealedRecord.wrappedKey },
        recordContext(memberId),
      ),
      wrapped: { keyId: sealedRecord.keyId, wrappedKey: sealedRecord.wrappedKey },
    }
  }
  const key = newDataKey()
  return { key, wrapped: wrapDataKey(key, recordContext(memberId)) }
}

/** Other members already using this PAN or account, by their application reference */
const duplicatesOf = async (
  payload: Payload,
  memberId: number,
  panIndex: string | null,
  accountIndex: string | null,
) => {
  const or: Where[] = []
  if (accountIndex) or.push({ accountIndex: { equals: accountIndex } })
  if (panIndex) or.push({ panIndex: { equals: panIndex } })
  if (or.length === 0) return ''
  const found = await payload.find({
    collection: 'kyc-records',
    where: { and: [{ member: { not_equals: memberId } }, { or }] },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.map((d) => d.reference || `record ${d.id}`).join(', ')
}

/** Documents attached must be this member's own, of the kind claimed */
const ownDocuments = async (
  payload: Payload,
  memberId: number,
  documents: KycInput['documents'],
) => {
  const ids: number[] = []
  for (const [kind, id] of Object.entries(documents)) {
    if (!id) continue
    const document = await payload
      .findByID({ collection: 'kyc-documents', id, depth: 0, overrideAccess: true })
      .catch(() => null)
    const owner =
      document && (typeof document.member === 'object' ? document.member.id : document.member)
    if (!document || owner !== memberId || document.kind !== kind) {
      throw new KycError('One of the documents could not be found. Please upload it again.')
    }
    ids.push(id)
  }
  return ids
}

/**
 * Encrypts and keeps an artist's identity details from the application. Replaces the earlier
 * identity details in full. Bank details are not part of it: an account already on file (given
 * before bank details moved to payout time, or added since) is left exactly as it is.
 */
export const saveKyc = async (
  payload: Payload,
  {
    member,
    input,
    reference,
    identityCode,
    consent,
  }: {
    member: Member
    input: KycInput
    reference: string
    /** The code in the identity photo, for reviewers to check against what is written */
    identityCode?: { code: string; issuedAt: string; expiresAt: string } | null
    /** Which privacy notice was agreed to, and how */
    consent: { noticeVersion: string; confirmation: string }
  },
): Promise<KycRecord> => {
  const existing = await findRecord(payload, member.id)
  const { key, wrapped } = dataKeyFor(existing, member.id)
  const seal = (field: SealedField, value: string | undefined) =>
    value ? sealField(key, value, fieldContext(member.id, field)) : null

  const panIndex = input.pan ? blindIndex('pan', input.pan) : null
  const accountIndex = existing?.accountIndex ?? null
  const documents = await ownDocuments(payload, member.id, input.documents)

  const data = {
    member: member.id,
    reference,
    ...wrapped,
    // Every artist gives a PAN; the column is kept for records saved before that was so
    idType: 'pan' as const,
    panSealed: seal('pan', input.pan),
    panNameSealed: seal('panName', input.panName),
    aadhaarLast4Sealed: seal('aadhaarLast4', input.aadhaarLast4),
    idMasked: maskPan(input.pan),
    idChoice: input.idChoice,
    otherIdKind: input.otherIdKind ?? null,
    aadhaarMasked: input.aadhaarLast4 ? maskAadhaar(input.aadhaarLast4) : null,
    // Filled in by runAadhaarCheck once the masked e-Aadhaar has been checked
    aadhaarCheck: {
      result: null,
      reasons: null,
      signer: null,
      signedOn: null,
      checkedAt: null,
      mode: null,
    },
    addressOnIdMatches: input.addressOnIdMatches ?? null,
    identityCode: identityCode?.code ?? null,
    identityCodeIssuedAt: identityCode?.issuedAt || null,
    identityCodeExpiresAt: identityCode?.expiresAt || null,
    panIndex,
    accountIndex,
    duplicates: (await duplicatesOf(payload, member.id, panIndex, accountIndex)) || null,
    documents,
    verification: { status: 'unverified' as const },
    consentedAt: new Date().toISOString(),
    consentNoticeVersion: consent.noticeVersion,
    consentConfirmation: consent.confirmation,
    consentWithdrawnAt: null,
  }

  const record = existing
    ? await payload.update({
        collection: 'kyc-records',
        id: existing.id,
        data: data as never,
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    : await payload.create({
        collection: 'kyc-records',
        data: data as never,
        overrideAccess: true,
        context: { disableRevalidate: true },
      })

  await logSecurityEvent(payload, {
    event: 'kyc-saved',
    email: member.email,
    subject: reference,
    detail: `pan and ${input.idChoice === 'aadhaar' ? 'masked aadhaar' : (input.otherIdKind ?? 'other id')}${data.duplicates ? ', possible duplicate' : ''}`,
  })
  return record
}

/** What a member sees of their own details: masks only, never a full value */
export const maskedKyc = async (payload: Payload, memberId: number) => {
  const record = await findRecord(payload, memberId)
  if (!record) return null
  const documents = await payload.find({
    collection: 'kyc-documents',
    where: { id: { in: (record.documents ?? []).map((d) => (typeof d === 'object' ? d.id : d)) } },
    depth: 0,
    overrideAccess: true,
  })
  return {
    panMasked: record.idType === 'pan' ? record.idMasked : null,
    aadhaarMasked: record.aadhaarMasked ?? (record.idType === 'aadhaar' ? record.idMasked : null),
    idChoice: record.idChoice ?? (record.aadhaarMasked ? 'aadhaar' : null),
    otherIdKind: record.otherIdKind ?? null,
    addressOnIdMatches: record.addressOnIdMatches,
    // None until a sale needs a payout and the artist adds them
    bank: record.accountMasked
      ? {
          accountMasked: record.accountMasked,
          ifscMasked: record.ifscMasked,
          bankName: record.bankName,
          accountType: record.accountType,
        }
      : null,
    payoutRequestedAt: record.payoutRequestedAt ?? null,
    nameMismatch: record.nameMismatch,
    documents: documents.docs.map((d) => ({ id: d.id, kind: d.kind })),
    pendingBank: record.pendingBank?.requestedAt
      ? {
          accountMasked: record.pendingBank.pendingAccountMasked,
          bankName: record.pendingBank.pendingBankName,
          requestedAt: record.pendingBank.requestedAt,
        }
      : null,
    verification: record.verification?.status ?? 'unverified',
  }
}

/** Whether a member's KYC is complete enough to send an application */
export const kycProblems = async (payload: Payload, memberId: number): Promise<string[]> => {
  const record = await findRecord(payload, memberId)
  if (!record) return ['Please add your identity details.']
  // Records saved before PAN was required may have only Aadhaar digits
  if (record.idType !== 'pan') return ['Please add your PAN to your identity details.']
  // Records saved before a second ID was asked of everyone
  if (!record.idChoice)
    return ['Please add a masked e-Aadhaar or another ID to your identity details.']
  // Records saved before the identity photo was asked for
  const photos = await payload.count({
    collection: 'kyc-documents',
    where: {
      and: [
        { id: { in: (record.documents ?? []).map((d) => (typeof d === 'object' ? d.id : d)) } },
        { kind: { equals: 'identity-photo' } },
      ],
    },
    overrideAccess: true,
  })
  if (photos.totalDocs === 0)
    return ['Please add the photo of you holding the code, in your identity details.']
  return record.consentWithdrawnAt
    ? ['Please give your consent again to send your application.']
    : []
}

/* ─── Documents ─────────────────────────────────────────────────────────── */

export const KYC_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024

/** Checks a document by its bytes, re-encodes images (which drops EXIF), keeps PDFs as they are */
const cleanDocument = async (
  bytes: Buffer,
): Promise<{ data: Buffer; contentType: string; extension: string }> => {
  if (bytes.length > KYC_DOCUMENT_MAX_BYTES)
    throw new KycError('That file is larger than 4 MB. Please send a smaller copy.')
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { data: bytes, contentType: 'application/pdf', extension: 'pdf' }
  }
  let format: string | undefined
  try {
    format = (await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata()).format
  } catch {
    format = undefined
  }
  if (!format || !['jpeg', 'png', 'webp'].includes(format)) {
    throw new KycError('Please send a photo (JPEG, PNG or WebP) or a PDF.')
  }
  const data = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .withIccProfile('srgb')
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
  return { data, contentType: 'image/jpeg', extension: 'jpg' }
}

const documentContext = (memberId: number, storageName: string) =>
  `member:${memberId}:document:${storageName}`

/** What an identity photo was taken with: its code, the code's times, and who it shows */
export type IdentityPhotoFacts = {
  code: string
  issuedAt: string
  expiresAt: string
  capturedWith: 'camera' | 'upload'
  fingerprint: string
}

const codeContext = (memberId: number, storageName: string) =>
  `${documentContext(memberId, storageName)}:identity-code`

/** Encrypts a document with a key of its own and keeps it in the private store */
export const storeKycDocument = async (
  payload: Payload,
  {
    member,
    kind,
    bytes,
    identity,
  }: {
    member: Member
    kind: KycDocumentKind
    bytes: Buffer
    /** For an identity photo: the code it was taken with, sealed with the document's own key */
    identity?: IdentityPhotoFacts
  },
): Promise<KycDocument> => {
  const existing = await payload.count({
    collection: 'kyc-documents',
    where: { member: { equals: member.id } },
    overrideAccess: true,
  })
  if (existing.totalDocs >= 20)
    throw new KycError('Too many documents have been uploaded. Please contact us.', 409)

  const { data, contentType, extension } = await cleanDocument(bytes)
  const storageName = `${member.id}/${randomBytes(16).toString('hex')}.${extension}.enc`
  const key = newDataKey()
  const wrapped = wrapDataKey(key, documentContext(member.id, storageName))
  const storageKey = await storeEncrypted(
    storageName,
    sealFile(key, data, documentContext(member.id, storageName)),
  )

  return payload.create({
    collection: 'kyc-documents',
    data: {
      member: member.id,
      kind,
      contentType,
      size: data.length,
      storageKey,
      ...wrapped,
      ...(identity
        ? {
            identityCodeSealed: sealField(key, identity.code, codeContext(member.id, storageName)),
            identityCodeIssuedAt: identity.issuedAt,
            identityCodeExpiresAt: identity.expiresAt,
            capturedWith: identity.capturedWith,
            identityFingerprint: identity.fingerprint,
          }
        : {}),
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
}

/** The facts kept with a member's identity photo, the code decrypted; null if it is not theirs */
export const identityPhotoFacts = async (
  payload: Payload,
  { memberId, documentId }: { memberId: number; documentId: number },
): Promise<Omit<IdentityPhotoFacts, 'capturedWith'> | null> => {
  const document = (await payload
    .findByID({
      collection: 'kyc-documents',
      id: documentId,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    .catch(() => null)) as
    | (KycDocument & {
        storageKey: string
        keyId: string
        wrappedKey: string
        identityCodeSealed?: string | null
        identityFingerprint?: string | null
      })
    | null
  const owner =
    document && (typeof document.member === 'object' ? document.member.id : document.member)
  if (!document || owner !== memberId || document.kind !== 'identity-photo') return null
  if (!document.identityCodeSealed || !document.identityFingerprint) return null
  const storageName = storageNameOf(document.storageKey)
  const key = unwrapDataKey(
    { keyId: document.keyId, wrappedKey: document.wrappedKey },
    documentContext(memberId, storageName),
  )
  return {
    code: openField(key, document.identityCodeSealed, codeContext(memberId, storageName)),
    issuedAt: document.identityCodeIssuedAt ?? '',
    expiresAt: document.identityCodeExpiresAt ?? '',
    fingerprint: document.identityFingerprint,
  }
}

const storageNameOf = (storageKey: string) => storageKey.replace(/^(?:[a-z]+\/)?kyc\//, '')

/* ─── Staff: reveal and open, every time with a reason, every time logged ── */

const requireReason = (reason: unknown): string => {
  const text = String(reason ?? '').trim()
  if (text.length < 10)
    throw new KycError(
      'Please give a reason of at least a few words. It is kept in the security log.',
      400,
    )
  return text.slice(0, 300)
}

export type RevealedKyc = Partial<
  Record<
    | SealedField
    | 'pendingAccountNumber'
    | 'pendingIfsc'
    | 'pendingHolderName'
    | 'pendingBranchName',
    string
  >
>

export const revealKyc = async (
  payload: Payload,
  { recordId, actor, reason }: { recordId: number; actor: User; reason: unknown },
): Promise<RevealedKyc> => {
  const why = requireReason(reason)
  const record = await payload.findByID({
    collection: 'kyc-records',
    id: recordId,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  const memberId = typeof record.member === 'object' ? record.member.id : record.member
  const { key } = dataKeyFor(record, memberId)
  const values: RevealedKyc = {}
  const raw = record as unknown as Record<string, string | null | undefined>
  for (const field of SEALED_FIELDS) {
    const sealed = raw[COLUMN[field] as string]
    if (sealed) values[field] = openField(key, sealed, fieldContext(memberId, field))
  }
  const pending = (record.pendingBank ?? {}) as Record<string, string | null | undefined>
  for (const [column, field, name] of [
    ['pendingAccountNumberSealed', 'accountNumber', 'pendingAccountNumber'],
    ['pendingIfscSealed', 'ifsc', 'pendingIfsc'],
    ['pendingHolderNameSealed', 'holderName', 'pendingHolderName'],
    ['pendingBranchNameSealed', 'branchName', 'pendingBranchName'],
  ] as const) {
    if (pending[column])
      values[name] = openField(key, pending[column]!, fieldContext(memberId, field))
  }
  await logSecurityEvent(payload, {
    event: 'kyc-revealed',
    actor: actor.id,
    subject: record.reference ?? `record ${record.id}`,
    detail: `Revealed by ${actor.email}: ${why}`,
  })
  return values
}

type SealedDocument = KycDocument & { storageKey: string; keyId: string; wrappedKey: string }

/** A document's plaintext, in memory. Callers decide what to log; this logs nothing. */
const decryptDocument = async (document: SealedDocument): Promise<Buffer> => {
  const memberId = typeof document.member === 'object' ? document.member.id : document.member
  const context = documentContext(memberId, storageNameOf(document.storageKey))
  const key = unwrapDataKey({ keyId: document.keyId, wrappedKey: document.wrappedKey }, context)
  return openFile(key, await readEncrypted(document.storageKey), context)
}

export const openKycDocument = async (
  payload: Payload,
  { documentId, actor, reason }: { documentId: number; actor: User; reason: unknown },
): Promise<{ bytes: Buffer; contentType: string; filename: string }> => {
  const why = requireReason(reason)
  const document = (await payload.findByID({
    collection: 'kyc-documents',
    id: documentId,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })) as KycDocument & { storageKey: string; keyId: string; wrappedKey: string }
  const memberId = typeof document.member === 'object' ? document.member.id : document.member
  const bytes = await decryptDocument(document)
  const record = await findRecord(payload, memberId)
  await logSecurityEvent(payload, {
    event: 'kyc-document-opened',
    actor: actor.id,
    subject: record?.reference ?? `member ${memberId}`,
    detail: `${document.kind} opened by ${actor.email}: ${why}`,
  })
  return {
    bytes,
    contentType: document.contentType,
    filename: `${document.kind}-${record?.reference ?? memberId}.${document.contentType === 'application/pdf' ? 'pdf' : 'jpg'}`,
  }
}

/* ─── The masked e-Aadhaar check ─────────────────────────────────────── */

export type AadhaarCheckInput = {
  memberId: number
  documentId: number
  /** The PDF's password: used here, in memory, and dropped. Never stored or logged. */
  password?: string
  last4?: string
  panName?: string
  dateOfBirth?: string | null
}

/** Opens the stored masked e-Aadhaar in memory and runs the check on it. Records nothing. */
export const checkStoredAadhaar = async (
  payload: Payload,
  input: AadhaarCheckInput,
): Promise<AadhaarCheck> => {
  const document = (await payload.findByID({
    collection: 'kyc-documents',
    id: input.documentId,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })) as SealedDocument
  return checkMaskedAadhaar({
    file: await decryptDocument(document),
    password: input.password,
    last4: input.last4,
    panName: input.panName,
    dateOfBirth: input.dateOfBirth,
  })
}

/**
 * Records a check's result on the member's KYC record, for staff. An unmasked copy is never
 * kept: its file and document are deleted, and the record says why.
 */
export const recordAadhaarCheck = async (
  payload: Payload,
  { memberId, documentId }: { memberId: number; documentId: number },
  check: AadhaarCheck,
): Promise<void> => {
  const record = await findRecord(payload, memberId)
  if (!record) return
  let documents = (record.documents ?? []).map((d) => (typeof d === 'object' ? d.id : d))
  if (check.unmasked) {
    const document = (await payload.findByID({
      collection: 'kyc-documents',
      id: documentId,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })) as SealedDocument
    await deleteEncrypted(document.storageKey)
    documents = documents.filter((id) => id !== documentId)
    await payload.update({
      collection: 'kyc-records',
      id: record.id,
      data: { documents },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    await payload.delete({
      collection: 'kyc-documents',
      id: documentId,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }
  await payload.update({
    collection: 'kyc-records',
    id: record.id,
    data: {
      aadhaarCheck: {
        result: check.result,
        reasons: check.reasons.join('\n') || null,
        signer: check.signer ?? null,
        signedOn: check.signedOn ?? null,
        checkedAt: new Date().toISOString(),
        mode: AADHAAR_CHECK_MODE,
      },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await logSecurityEvent(payload, {
    event: 'kyc-aadhaar-checked',
    subject: record.reference ?? `member ${memberId}`,
    detail: `${check.result}${check.unmasked ? ', unmasked copy deleted' : ''} (${AADHAAR_CHECK_MODE})`,
  })
}

/** Checks and records in one go, never throwing: a failure to check is itself a result */
export const runAadhaarCheck = async (payload: Payload, input: AadhaarCheckInput) => {
  let check: AadhaarCheck
  try {
    check = await checkStoredAadhaar(payload, input)
  } catch (error) {
    payload.logger.error({ err: error, msg: 'Masked e-Aadhaar check failed to run' })
    check = {
      result: 'manual-review',
      reasons: ['The check could not be run on this file. Please check it by hand.'],
    }
  }
  await recordAadhaarCheck(payload, input, check)
  return check
}

/* ─── Payout details: added, and changed, after approval ──────────────── */

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

/**
 * Records a set of bank details as pending: the first payout details, or a change to them. Any
 * current ones stay in force until staff check the new ones (a ₹1 test transfer first) and approve
 * them. Returns the one-time token for the "this was not me" link, and whether these are the first.
 */
export const requestBankChange = async (
  payload: Payload,
  { member, bank }: { member: Member; bank: BankInput },
): Promise<{ record: KycRecord; cancelToken: string; first: boolean }> => {
  const record = await findRecord(payload, member.id)
  if (!record)
    throw new KycError('We do not have your identity details yet. Please write to us.', 404)
  const first = !record.accountMasked
  const { key } = dataKeyFor(record, member.id)
  const seal = (field: SealedField, value: string) =>
    sealField(key, value, fieldContext(member.id, field))
  const cancelToken = randomBytes(32).toString('base64url')

  const updated = await payload.update({
    collection: 'kyc-records',
    id: record.id,
    data: {
      pendingBank: {
        pendingAccountNumberSealed: seal('accountNumber', bank.accountNumber),
        pendingIfscSealed: seal('ifsc', bank.ifsc),
        pendingHolderNameSealed: seal('holderName', bank.holderName),
        pendingBranchNameSealed: seal('branchName', bank.branchName),
        pendingAccountMasked: maskAccount(bank.accountNumber),
        pendingIfscMasked: maskIfsc(bank.ifsc),
        pendingBankName: bank.bankName,
        pendingAccountType: bank.accountType,
        requestedAt: new Date().toISOString(),
        cancelTokenHash: tokenHash(cancelToken),
      },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await logSecurityEvent(payload, {
    event: 'kyc-bank-change-requested',
    email: member.email,
    subject: record.reference ?? undefined,
    detail: first ? 'First payout details' : 'Change of payout details',
  })
  return { record: updated, cancelToken, first }
}

const clearPending = {
  pendingBank: {
    pendingAccountNumberSealed: null,
    pendingIfscSealed: null,
    pendingHolderNameSealed: null,
    pendingBranchNameSealed: null,
    pendingAccountMasked: null,
    pendingIfscMasked: null,
    pendingBankName: null,
    pendingAccountType: null,
    requestedAt: null,
    cancelTokenHash: null,
  },
}

/** "This was not me": drops the pending change. Returns the member it belonged to, if any. */
export const cancelBankChangeByToken = async (
  payload: Payload,
  token: string,
): Promise<number | null> => {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null
  const found = await payload.find({
    collection: 'kyc-records',
    where: { 'pendingBank.cancelTokenHash': { equals: tokenHash(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const record = found.docs[0]
  if (!record) return null
  await payload.update({
    collection: 'kyc-records',
    id: record.id,
    data: clearPending as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const memberId = typeof record.member === 'object' ? record.member.id : record.member
  await logSecurityEvent(payload, {
    event: 'kyc-bank-change-cancelled',
    subject: record.reference ?? undefined,
    detail: 'Cancelled from the link in the notification email',
  })
  return memberId
}

/** Staff approve a pending change: the sealed values move across without being decrypted */
export const approveBankChange = async (
  payload: Payload,
  { recordId, actor }: { recordId: number; actor: User },
): Promise<KycRecord> => {
  const record = await payload.findByID({
    collection: 'kyc-records',
    id: recordId,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  const pending = (record.pendingBank ?? {}) as Record<string, string | null | undefined>
  if (!pending.requestedAt || !pending.pendingAccountNumberSealed)
    throw new KycError('There is no change of bank details waiting.', 409)
  const memberId = typeof record.member === 'object' ? record.member.id : record.member
  const { key } = dataKeyFor(record, memberId)
  const accountNumber = openField(
    key,
    pending.pendingAccountNumberSealed,
    fieldContext(memberId, 'accountNumber'),
  )
  const accountIndex = blindIndex('account', accountNumber)
  // Whether the account holder is plausibly the artist: against the name on the PAN, opened in
  // memory for this comparison only
  const holderName = pending.pendingHolderNameSealed
    ? openField(key, pending.pendingHolderNameSealed, fieldContext(memberId, 'holderName'))
    : null
  const panName = record.panNameSealed
    ? openField(key, record.panNameSealed, fieldContext(memberId, 'panName'))
    : null
  const nameMismatch = Boolean(holderName && panName && !namesPlausiblyMatch(panName, holderName))

  const updated = await payload.update({
    collection: 'kyc-records',
    id: record.id,
    data: {
      accountNumberSealed: pending.pendingAccountNumberSealed,
      ifscSealed: pending.pendingIfscSealed,
      holderNameSealed: pending.pendingHolderNameSealed,
      branchNameSealed: pending.pendingBranchNameSealed,
      accountMasked: pending.pendingAccountMasked,
      ifscMasked: pending.pendingIfscMasked,
      bankName: pending.pendingBankName,
      accountType: pending.pendingAccountType,
      accountIndex,
      nameMismatch,
      duplicates:
        (await duplicatesOf(payload, memberId, record.panIndex ?? null, accountIndex)) || null,
      verification: {
        status: 'verified',
        method: 'manual',
        verifiedAt: new Date().toISOString(),
        verifiedBy: actor.id,
      },
      ...clearPending,
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await logSecurityEvent(payload, {
    event: 'kyc-bank-change-approved',
    actor: actor.id,
    subject: record.reference ?? undefined,
    detail: `Approved by ${actor.email}`,
  })
  return updated
}

/**
 * Staff ask an approved artist for payout details, when a sale needs a payout. Only the request
 * is recorded here; the artist adds the details themselves in their account (requestBankChange),
 * and the email that tells them so never asks for bank details and never carries any.
 */
export const requestPayoutDetails = async (
  payload: Payload,
  { recordId, actor }: { recordId: number; actor: User },
): Promise<{ record: KycRecord; member: Member }> => {
  const record = await payload.findByID({
    collection: 'kyc-records',
    id: recordId,
    depth: 0,
    overrideAccess: true,
  })
  const memberId = typeof record.member === 'object' ? record.member.id : record.member
  const member = await payload.findByID({
    collection: 'members',
    id: memberId,
    depth: 0,
    overrideAccess: true,
  })
  if (!member.artistId)
    throw new KycError('Payout details are asked for once the artist is approved.', 409)
  if (record.pendingBank?.requestedAt)
    throw new KycError('Their payout details are already waiting for your check.', 409)
  if (record.accountMasked)
    throw new KycError(
      'Their payout details are already on file. To change them, the artist does so from their account.',
      409,
    )

  const updated = await payload.update({
    collection: 'kyc-records',
    id: record.id,
    data: { payoutRequestedAt: new Date().toISOString() } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await logSecurityEvent(payload, {
    event: 'kyc-payout-details-requested',
    actor: actor.id,
    subject: record.reference ?? undefined,
    detail: `Asked by ${actor.email}`,
  })
  return { record: updated, member }
}

/* ─── Deletion ──────────────────────────────────────────────────────────── */

/** Deletes a member's KYC record and every document, ciphertext included. */
export const purgeKyc = async (
  payload: Payload,
  { memberId, reason }: { memberId: number; reason: string },
): Promise<boolean> => {
  const documents = await payload.find({
    collection: 'kyc-documents',
    where: { member: { equals: memberId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  for (const document of documents.docs as (KycDocument & { storageKey: string })[]) {
    await removeFile(document.storageKey)
    await payload.delete({
      collection: 'kyc-documents',
      id: document.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }
  const record = await findRecord(payload, memberId)
  if (record) {
    await payload.delete({
      collection: 'kyc-records',
      id: record.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }
  if (record || documents.docs.length) {
    await logSecurityEvent(payload, {
      event: 'kyc-purged',
      subject: record?.reference ?? `member ${memberId}`,
      detail: `${reason}; ${documents.docs.length} document(s)`,
    })
  }
  return Boolean(record || documents.docs.length)
}

/**
 * Someone applying again gives their identity documents and their identity photo afresh, so those
 * go now, with the identity code and every check that was made on them. What they typed (the PAN,
 * the name on it, the last four digits, which ID they chose) stays on the record for the new
 * application, if the weekly purge has not already removed it. Logged like a purge.
 */
export const clearIdentityEvidence = async (
  payload: Payload,
  { memberId, reason }: { memberId: number; reason: string },
): Promise<number> => {
  const documents = await payload.find({
    collection: 'kyc-documents',
    where: { member: { equals: memberId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  for (const document of documents.docs as (KycDocument & { storageKey: string })[]) {
    await removeFile(document.storageKey)
    await payload.delete({
      collection: 'kyc-documents',
      id: document.id,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }
  const record = await findRecord(payload, memberId)
  if (record) {
    await payload.update({
      collection: 'kyc-records',
      id: record.id,
      data: {
        documents: [],
        aadhaarCheck: {
          result: null,
          reasons: null,
          signer: null,
          signedOn: null,
          checkedAt: null,
        },
        identityCode: null,
        identityCodeIssuedAt: null,
        identityCodeExpiresAt: null,
        nameMismatch: null,
        verification: { status: 'unverified', method: null, verifiedAt: null, verifiedBy: null },
        consentedAt: null,
        consentConfirmation: null,
      } as never,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }
  if (record || documents.docs.length) {
    await logSecurityEvent(payload, {
      event: 'kyc-purged',
      subject: record?.reference ?? `member ${memberId}`,
      detail: `${reason}; ${documents.docs.length} document(s); typed details kept`,
    })
  }
  return documents.docs.length
}

/**
 * Deletes a document's file before its row. A file in another environment's folder (a row copied
 * into a preview database from production) is left alone and only the copied row goes. Any other
 * failure stops here, so the row survives and the next purge tries again: a row is never deleted
 * while its file might still exist.
 */
const removeFile = async (storageKey: string) => {
  if (!storageKey.startsWith(kycPrefix())) return
  await deleteEncrypted(storageKey)
}

/* ─── Consent and legal hold: staff actions, each with a reason ────────── */

/**
 * Records a withdrawal of consent that reached us outside the site (a letter, an email). The
 * member's own request does this through /next/members/data-request; nobody edits the date.
 */
export const recordConsentWithdrawal = async (
  payload: Payload,
  { recordId, actor, reason }: { recordId: number; actor: User; reason: unknown },
): Promise<KycRecord> => {
  const why = requireReason(reason)
  const record = await payload.findByID({
    collection: 'kyc-records',
    id: recordId,
    depth: 0,
    overrideAccess: true,
  })
  if (record.consentWithdrawnAt) {
    throw new KycError('Consent is already recorded as withdrawn.', 409)
  }
  const updated = await payload.update({
    collection: 'kyc-records',
    id: recordId,
    data: { consentWithdrawnAt: new Date().toISOString() },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await logSecurityEvent(payload, {
    event: 'kyc-consent-withdrawn',
    actor: actor.id,
    subject: record.reference ?? `record ${record.id}`,
    detail: `Recorded by ${actor.email}, received outside the site: ${why}`,
  })
  return updated
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Sets, moves or lifts the legal hold: while it is in the future, the record is kept even after
 * consent is withdrawn (docs/KYC.md#retention). Every change is logged with the old and new date.
 */
export const setLegalHold = async (
  payload: Payload,
  {
    recordId,
    actor,
    until,
    reason,
  }: { recordId: number; actor: User; until: unknown; reason: unknown },
): Promise<KycRecord> => {
  const why = requireReason(reason)
  let next: string | null = null
  if (until !== null && until !== undefined && String(until).trim() !== '') {
    const day = String(until).trim()
    const date = new Date(`${day}T23:59:59.999+05:30`)
    if (!DAY_PATTERN.test(day) || Number.isNaN(date.getTime())) {
      throw new KycError('Give the date as YYYY-MM-DD.', 400)
    }
    if (date.getTime() <= Date.now())
      throw new KycError('A legal hold must end in the future.', 400)
    next = date.toISOString()
  }
  const record = await payload.findByID({
    collection: 'kyc-records',
    id: recordId,
    depth: 0,
    overrideAccess: true,
  })
  const updated = await payload.update({
    collection: 'kyc-records',
    id: recordId,
    data: { legalHoldUntil: next },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const show = (v?: string | null) => (v ? v.slice(0, 10) : 'none')
  await logSecurityEvent(payload, {
    event: 'kyc-legal-hold-changed',
    actor: actor.id,
    subject: record.reference ?? `record ${record.id}`,
    detail: `${actor.email} changed the legal hold from ${show(record.legalHoldUntil)} to ${show(next)}: ${why}`,
  })
  return updated
}

/* ─── Retention (docs/KYC.md) ───────────────────────────────────────────── */

const DAY = 86_400_000
export const RETENTION = {
  /** KYC of an application we declined */
  rejectedDays: 90,
  /** KYC of an application nobody has touched for this long, never sent */
  abandonedDraftDays: 180,
  /** A document uploaded but never saved with the step */
  orphanDocumentDays: 7,
  // Approved artists: [confirm with CA] how many years after the last payment the law requires.
  // Until that is settled their KYC is never purged automatically (docs/KYC.md#retention).
} as const

export type PurgeCandidate = { memberId: number; reason: string }

/**
 * Who is due to have their KYC deleted, and why. Pure reading: `pnpm kyc:purge` shows this list,
 * and deletes only with --apply. A legal hold in the future always wins.
 */
export const kycPurgeCandidates = async (
  payload: Payload,
  now = new Date(),
): Promise<{ members: PurgeCandidate[]; orphanDocuments: number[] }> => {
  const before = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
  const records = await payload.find({
    collection: 'kyc-records',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const held = (r: KycRecord) => Boolean(r.legalHoldUntil && new Date(r.legalHoldUntil) > now)
  const memberOf = (r: KycRecord) => (typeof r.member === 'object' ? r.member.id : r.member)
  const byMember = new Map(records.docs.map((r) => [memberOf(r), r]))

  const due = new Map<number, string>()
  for (const record of records.docs) {
    if (record.consentWithdrawnAt && !held(record)) due.set(memberOf(record), 'consent withdrawn')
  }

  const stale = !byMember.size
    ? { docs: [] }
    : await payload.find({
        collection: 'applications',
        where: {
          and: [
            { type: { equals: 'artist' } },
            { member: { in: [...byMember.keys()] } },
            {
              or: [
                {
                  and: [
                    { stage: { equals: 'rejected' } },
                    { decidedAt: { less_than: before(RETENTION.rejectedDays) } },
                  ],
                },
                {
                  and: [
                    { stage: { equals: 'draft' } },
                    { updatedAt: { less_than: before(RETENTION.abandonedDraftDays) } },
                  ],
                },
              ],
            },
          ],
        },
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
  // Only a person's current application counts: an old declined one says nothing about the new
  // application they have since started
  const latest = new Map<number, number>()
  if (stale.docs.length) {
    const theirs = await payload.find({
      collection: 'applications',
      where: {
        and: [
          { type: { equals: 'artist' } },
          {
            member: {
              in: stale.docs.map((a) => (typeof a.member === 'object' ? a.member.id : a.member)),
            },
          },
        ],
      },
      sort: 'createdAt',
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    for (const a of theirs.docs)
      latest.set(typeof a.member === 'object' ? a.member.id : a.member, a.id)
  }
  for (const application of stale.docs) {
    const memberId =
      typeof application.member === 'object' ? application.member.id : application.member
    if (latest.get(memberId) !== application.id) continue
    const record = byMember.get(memberId)
    if (!record || held(record) || due.has(memberId)) continue
    due.set(
      memberId,
      application.stage === 'rejected'
        ? `application declined over ${RETENTION.rejectedDays} days ago`
        : `application left unsent for over ${RETENTION.abandonedDraftDays} days`,
    )
  }

  // Uploaded but never attached to a saved record
  const attached = new Set(
    records.docs.flatMap((r) => (r.documents ?? []).map((d) => (typeof d === 'object' ? d.id : d))),
  )
  const old = await payload.find({
    collection: 'kyc-documents',
    where: { createdAt: { less_than: before(RETENTION.orphanDocumentDays) } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const orphanDocuments = old.docs
    .filter((d) => !attached.has(d.id))
    .filter((d) => {
      const memberId = typeof d.member === 'object' ? d.member.id : d.member
      return !due.has(memberId)
    })
    .map((d) => d.id)

  return {
    members: [...due].map(([memberId, reason]) => ({ memberId, reason })),
    orphanDocuments,
  }
}

/** Deletes one uploaded document that was never saved with a record */
export const purgeKycDocument = async (payload: Payload, documentId: number): Promise<void> => {
  const document = (await payload.findByID({
    collection: 'kyc-documents',
    id: documentId,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })) as KycDocument & { storageKey: string }
  await removeFile(document.storageKey)
  await payload.delete({
    collection: 'kyc-documents',
    id: documentId,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
}

/* ─── Key rotation ──────────────────────────────────────────────────────── */

/**
 * Re-wraps every data key still under an older master key with the current one. The data itself
 * is not touched. Safe to run twice: keys already under the current master key are skipped.
 * Returns how many were re-wrapped and how many could not be opened (wrong or missing old key).
 */
export const rotateKycKeys = async (
  payload: Payload,
  { apply }: { apply: boolean },
): Promise<{ records: number; documents: number; failed: number; current: string }> => {
  const { current } = masterKeys()
  let records = 0
  let documents = 0
  let failed = 0

  const sealedRecords = (
    await payload.find({
      collection: 'kyc-records',
      where: { keyId: { not_equals: current.id } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
  ).docs as (KycRecord & { keyId: string; wrappedKey: string })[]
  for (const record of sealedRecords) {
    const memberId = typeof record.member === 'object' ? record.member.id : record.member
    try {
      const wrapped = rewrapDataKey(record, recordContext(memberId))
      if (apply) {
        await payload.update({
          collection: 'kyc-records',
          id: record.id,
          data: wrapped as never,
          overrideAccess: true,
          context: { disableRevalidate: true },
        })
      }
      records += 1
    } catch {
      failed += 1
    }
  }

  const sealedDocuments = (
    await payload.find({
      collection: 'kyc-documents',
      where: { keyId: { not_equals: current.id } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
  ).docs as (KycDocument & { storageKey: string; keyId: string; wrappedKey: string })[]
  for (const document of sealedDocuments) {
    const memberId = typeof document.member === 'object' ? document.member.id : document.member
    try {
      const wrapped = rewrapDataKey(
        document,
        documentContext(memberId, storageNameOf(document.storageKey)),
      )
      if (apply) {
        await payload.update({
          collection: 'kyc-documents',
          id: document.id,
          data: wrapped as never,
          overrideAccess: true,
          context: { disableRevalidate: true },
        })
      }
      documents += 1
    } catch {
      failed += 1
    }
  }

  return { records, documents, failed, current: current.id }
}

export type PurgeSummary = {
  members: number
  documents: number
  failed: number
  reasons: Record<string, number>
}

/**
 * Applies the retention rules once: what `pnpm kyc:purge --apply` and the weekly cron run. One
 * member's failure does not stop the rest; it is counted, and retried next time. Every deletion is
 * in the security log; the summary carries counts only.
 */
export const runKycPurge = async (payload: Payload, now = new Date()): Promise<PurgeSummary> => {
  const { members, orphanDocuments } = await kycPurgeCandidates(payload, now)
  const summary: PurgeSummary = { members: 0, documents: 0, failed: 0, reasons: {} }
  for (const { memberId, reason } of members) {
    try {
      await purgeKyc(payload, { memberId, reason: `Retention: ${reason}` })
      summary.members += 1
      summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1
    } catch {
      summary.failed += 1
    }
  }
  for (const id of orphanDocuments) {
    try {
      await purgeKycDocument(payload, id)
      summary.documents += 1
    } catch {
      summary.failed += 1
    }
  }
  return summary
}
