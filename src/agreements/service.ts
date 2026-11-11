import 'server-only'

import { createHash } from 'node:crypto'
import type { Payload } from 'payload'

import { blindIndex } from '@/kyc/crypto'
import { CODE_PROBLEM, checkIdentityCode, IDENTITY_CODE_MINUTES } from '@/kyc/identityCode'
import { signerTaxId, storeKycDocument } from '@/kyc/service'
import { findOwnApplication } from '@/members/application'
import { newIdentityCode } from '@/members/ids'
import { canChange } from '@/members/standing'
import type { AgreementExecution, Member } from '@/payload-types'

import type { AgreementDocument } from './documents'
import { notifyStaffOfSignedAgreement } from './emails'
import { buildAgreementPdf } from './pdf'

/**
 * Signing an agreement after approval, at /collaborate/artist-agreement or
 * /collaborate/trade-agreement (docs/AGREEMENTS.md). The member is signed in with their emailed
 * code, and gives the ID issued on approval. Then, on one record (agreement-executions):
 *   1. a ten-minute code, kept only as an HMAC, as for the application's identity photo;
 *   2. a live photo of them holding the code, their name and their ID, encrypted in the vault;
 *   3. both boxes ticked and I AGREE typed: the PDF is built with their execution block filled
 *      in, kept in the vault, and the record waits for PAT & J.K. Co.'s DSC countersignature.
 * Nothing is sent to the member until the countersigned copy is uploaded (./staff.ts).
 */

export class AgreementError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}

export const AGREE_EXACTLY = 'I AGREE'

/** A photo taken with a code that ran out this long ago still counts, as for applications */
const GRACE_MS = 2 * 60_000
/** Signing must follow the photo within this, or a new photo is asked for */
const SIGN_WITHIN_MS = 60 * 60_000

type Execution = AgreementExecution & { codeHash?: string | null }

/** "12 November 2026, 10:15:04 IST" */
export const istTimestamp = (date: Date) =>
  `${date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })} IST`

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** The agreement's text, hashed, so a record says exactly which words were signed */
export const documentDigest = (agreement: AgreementDocument) =>
  sha256(JSON.stringify(agreement.text))

/** The member's own ID for this agreement, checked against the one they typed */
export const checkMemberId = (member: Member, agreement: AgreementDocument, given: unknown) => {
  const own = member[agreement.idField]
  if (!own) {
    throw new AgreementError(
      agreement.kind === 'artist'
        ? 'This page is for approved artists. Your account has no artist ID yet.'
        : 'This page is for approved trade partners. Your account has no partner ID yet.',
      403,
    )
  }
  const typed = String(given ?? '')
    .trim()
    .toUpperCase()
  if (typed !== own.toUpperCase()) {
    throw new AgreementError(
      `That is not the ${agreement.prefix} ID issued to this account. Please check your approval email.`,
      403,
    )
  }
  if (!canChange(member.standing)) {
    throw new AgreementError('Your account is on hold. Please write to us before signing.', 403)
  }
  return own
}

const addressLine = (address?: Record<string, unknown> | null) =>
  address
    ? ['line1', 'line2', 'landmark', 'city', 'district', 'state', 'postalCode', 'country']
        .map((key) => String(address[key] ?? '').trim())
        .filter(Boolean)
        .join(', ')
    : ''

export type Signer = {
  name: string
  memberCode: string
  taxIdMasked: string
  email: string
  phone: string
  address: string
  firm: string
  firmRegistration: string
}

/** Who signs, from their KYC record and approved application: what the page shows them */
export const signerFor = async (
  payload: Payload,
  member: Member,
  agreement: AgreementDocument,
): Promise<Signer> => {
  const application = await findOwnApplication(payload, member, agreement.kind, 0)
  const tax = await signerTaxId(payload, member.id)
  const a = (application ?? {}) as Record<string, Record<string, unknown> | undefined>
  const about = a.about ?? {}
  const partner = a.partner ?? {}
  const address = (a.address?.residence ?? null) as Record<string, unknown> | null
  return {
    name:
      tax.panName ||
      String((agreement.kind === 'artist' ? about.legalName : partner.fullName) ?? ''),
    memberCode: member[agreement.idField] ?? '',
    taxIdMasked: tax.masked ?? '',
    email: member.email,
    phone: String((agreement.kind === 'artist' ? about.phone : partner.phone) ?? ''),
    address:
      agreement.kind === 'artist'
        ? addressLine(address)
        : [partner.city, partner.state].filter(Boolean).join(', '),
    firm: agreement.kind === 'partner' ? String(partner.organisation ?? '') : '',
    firmRegistration: agreement.kind === 'partner' ? String(partner.gstin ?? '') : '',
  }
}

const latestExecution = async (
  payload: Payload,
  memberId: number,
  agreement: AgreementDocument,
): Promise<Execution | null> =>
  ((
    await payload.find({
      collection: 'agreement-executions',
      where: { and: [{ member: { equals: memberId } }, { kind: { equals: agreement.kind } }] },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
  ).docs[0] as Execution | undefined) ?? null

const save = (payload: Payload, id: number, data: Record<string, unknown>) =>
  payload.update({
    collection: 'agreement-executions',
    id,
    data: data as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  }) as Promise<Execution>

export type AgreementStatus = {
  state: 'not-started' | AgreementExecution['state']
  signer: Signer
  /** The current code's times, while a photo is still to be taken with it */
  code: { issuedAt: string; expiresAt: string } | null
  photo: { at: string; code: string } | null
  signedAt: string | null
  signedAtIst: string | null
  version: string
}

export const agreementStatus = async (
  payload: Payload,
  member: Member,
  agreement: AgreementDocument,
): Promise<AgreementStatus> => {
  const execution = await latestExecution(payload, member.id, agreement)
  const signer = await signerFor(payload, member, agreement)
  // Once signed, the page shows what was signed, not what the application says now
  const signed =
    execution && execution.state !== 'in-progress'
      ? {
          ...signer,
          ...Object.fromEntries(
            Object.entries(execution.signer ?? {}).filter(([, v]) => typeof v === 'string' && v),
          ),
        }
      : signer
  return {
    state: execution?.state ?? 'not-started',
    signer: signed,
    code:
      execution?.state === 'in-progress' && execution.codeIssuedAt && execution.codeExpiresAt
        ? { issuedAt: execution.codeIssuedAt, expiresAt: execution.codeExpiresAt }
        : null,
    photo:
      execution?.state === 'in-progress' && execution.photo && execution.photoAt
        ? { at: execution.photoAt, code: execution.verificationCode ?? '' }
        : null,
    signedAt: execution?.signedAt ?? null,
    signedAtIst: execution?.signedAtIst ?? null,
    version: agreement.version,
  }
}

/** The record being signed now, made if there is none; refused once the agreement is signed */
const openExecution = async (
  payload: Payload,
  member: Member,
  agreement: AgreementDocument,
): Promise<Execution> => {
  const latest = await latestExecution(payload, member.id, agreement)
  if (latest?.state === 'in-progress') return latest
  if (latest) throw new AgreementError('You have already signed this agreement.', 409)
  return (await payload.create({
    collection: 'agreement-executions',
    data: {
      member: member.id,
      kind: agreement.kind,
      memberCode: member[agreement.idField],
      state: 'in-progress',
      version: agreement.version,
      documentDigest: documentDigest(agreement),
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })) as Execution
}

/** A new ten-minute code. Any earlier code, and any photo taken with it, stops counting. */
export const issueAgreementCode = async (
  payload: Payload,
  member: Member,
  agreement: AgreementDocument,
  now = new Date(),
) => {
  const execution = await openExecution(payload, member, agreement)
  const code = newIdentityCode()
  const issuedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + IDENTITY_CODE_MINUTES * 60_000).toISOString()
  await save(payload, execution.id, {
    codeHash: blindIndex('identity-code', code),
    codeIssuedAt: issuedAt,
    codeExpiresAt: expiresAt,
    photo: null,
    photoAt: null,
    photoSha256: null,
    verificationCode: null,
  })
  return { code, issuedAt, expiresAt, minutes: IDENTITY_CODE_MINUTES }
}

/** The live photo, taken with the current code: encrypted into the vault */
export const receiveAgreementPhoto = async (
  payload: Payload,
  member: Member,
  agreement: AgreementDocument,
  { bytes, code, capturedWith }: { bytes: Buffer; code: string; capturedWith: 'camera' | 'upload' },
  now = new Date(),
) => {
  const execution = await openExecution(payload, member, agreement)
  const check = checkIdentityCode(
    { identityCodeHash: execution.codeHash, identityCodeExpiresAt: execution.codeExpiresAt },
    code,
    now,
  )
  if (check !== 'ok') throw new AgreementError(CODE_PROBLEM[check], 409)
  const signer = await signerFor(payload, member, agreement)
  const document = await storeKycDocument(payload, {
    member,
    kind: 'agreement-photo',
    bytes,
    identity: {
      code,
      issuedAt: execution.codeIssuedAt ?? '',
      expiresAt: execution.codeExpiresAt ?? '',
      capturedWith,
      fingerprint: blindIndex('identity', `${signer.name}|${signer.memberCode}`),
    },
  })
  await save(payload, execution.id, {
    photo: document.id,
    photoAt: now.toISOString(),
    photoSha256: document.sha256,
    verificationCode: code,
  })
  return { documentId: document.id, at: now.toISOString() }
}

const clean = (value: unknown, max = 300) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

export type SignInput = {
  typed: unknown
  agreedTerms: unknown
  agreedPrivacy: unknown
  /** Trade partners only: what their application did not ask for */
  firm?: unknown
  firmRegistration?: unknown
  address?: unknown
  ip: string
  userAgent: string
}

/** Signs: builds the PDF with the execution block filled in and keeps it, for countersigning */
export const signAgreement = async (
  payload: Payload,
  member: Member,
  agreement: AgreementDocument,
  input: SignInput,
  now = new Date(),
) => {
  const execution = await openExecution(payload, member, agreement)
  if (!execution.photo || !execution.photoAt || !execution.verificationCode) {
    throw new AgreementError('Please take the live photo with your code first.', 409)
  }
  const expires = new Date(execution.codeExpiresAt ?? 0).getTime() + GRACE_MS
  if (new Date(execution.photoAt).getTime() > expires) {
    throw new AgreementError(CODE_PROBLEM.expired, 409)
  }
  if (now.getTime() - new Date(execution.photoAt).getTime() > SIGN_WITHIN_MS) {
    throw new AgreementError(
      'Your photo was taken more than an hour ago. Please get a new code and take it again.',
      409,
    )
  }
  if (input.agreedTerms !== true || input.agreedPrivacy !== true) {
    throw new AgreementError('Please tick both boxes.')
  }
  if (input.typed !== AGREE_EXACTLY) {
    throw new AgreementError(`Please type ${AGREE_EXACTLY} in capital letters.`)
  }

  const signer = await signerFor(payload, member, agreement)
  if (agreement.kind === 'partner') {
    signer.firm = clean(input.firm, 200) || signer.firm
    signer.firmRegistration = clean(input.firmRegistration, 60) || signer.firmRegistration
    signer.address = clean(input.address) || signer.address
    const missing = [
      !signer.firm && 'your firm or studio’s legal name',
      !signer.firmRegistration && 'its GSTIN, COA ID or registration number',
      !signer.address && 'its business address with PIN or ZIP code',
    ].filter(Boolean)
    if (missing.length) throw new AgreementError(`Please give ${missing.join(', ')}.`)
  }
  if (!signer.name) {
    throw new AgreementError('Your legal name is missing from your record. Please write to us.')
  }

  const tax = await signerTaxId(payload, member.id)
  const signedAtIst = istTimestamp(now)
  const portal = `https://pjk.co.in/collaborate/${agreement.slug}`
  const photoRef = `Code ${execution.verificationCode} · photo received ${istTimestamp(new Date(execution.photoAt))} · SHA-256 ${execution.photoSha256 ?? ''}`
  const contact = [signer.email, signer.phone].filter(Boolean).join(' · ')
  const execLine = `${AGREE_EXACTLY} (typed; both declarations ticked; live photo verified)`
  const audit = `${portal} · ${signedAtIst} · IP ${input.ip}`
  const taxId = tax.pan || signer.taxIdMasked
  const values =
    agreement.kind === 'artist'
      ? [signer.name, signer.memberCode, taxId, contact, signer.address, photoRef, execLine, audit]
      : [
          signer.name,
          signer.firm,
          signer.memberCode,
          taxId,
          signer.firmRegistration,
          contact,
          signer.address,
          photoRef,
          execLine,
          audit,
        ]

  const pdf = await buildAgreementPdf({
    agreement,
    values,
    memberCode: signer.memberCode,
    signedAtIst,
  })
  const document = await storeKycDocument(payload, { member, kind: 'agreement-signed', bytes: pdf })
  const signed = await save(payload, execution.id, {
    state: 'pending-countersignature',
    version: agreement.version,
    documentDigest: documentDigest(agreement),
    signer: {
      name: signer.name,
      firm: signer.firm || null,
      taxIdMasked: signer.taxIdMasked,
      firmRegistration: signer.firmRegistration || null,
      email: signer.email,
      phone: signer.phone,
      address: signer.address,
    },
    typed: AGREE_EXACTLY,
    signedAt: now.toISOString(),
    signedAtIst,
    ip: input.ip,
    userAgent: clean(input.userAgent, 500),
    signedPdf: document.id,
    signedPdfSha256: document.sha256,
  })
  await notifyStaffOfSignedAgreement(payload, { execution: signed, agreement }).catch((error) =>
    payload.logger.error({ err: error, msg: 'Could not tell staff an agreement was signed' }),
  )
  return { signedAt: signed.signedAt, signedAtIst }
}
