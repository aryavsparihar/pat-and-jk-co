// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as deleteDraftRoute } from '@/app/(frontend)/next/members/application/delete-draft/route'
import { POST as saveIdentity } from '@/app/(frontend)/next/members/kyc/route'
import { identityChecked, identitySent, markIdentityChecked, returnIdentity } from '@/kyc/check'
import { identityFingerprint } from '@/kyc/identityCode'
import { bankSchema, BANK_ERRORS } from '@/kyc/schema'
import { KycError, requestBankChange, storeKycDocument } from '@/kyc/service'
import { VERIFY_ERRORS } from '@/kyc/verify'
import { ensureApplication } from '@/members/accounts'
import { applicationStatus } from '@/members/status'
import type { Application, Member, User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'
import {
  FAKE,
  FAKE_CODE,
  goodBank,
  goodKyc,
  goodPartnerKyc,
  identityPhotoBytes,
  identityPhotos,
  removeKycFor,
} from '../helpers/kyc'

/*
 * Confirm who you are, after approval (the founder's brief of 25 November 2026, section 11): only
 * an approved applicant may give identity; it can be saved to finish later, then sent once; the
 * team marks it checked, which unlocks the agreement, or sends it back with a note. Outside India
 * a passport takes the PAN's place. Drafts can be deleted, and payouts may go to a bank abroad,
 * always in the artist's own name. Everyone here is made up (@verify.example.test).
 */

let payload: Payload
let closeApplications: () => Promise<void>
let reviewer: User
const DOMAIN = '@verify.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const DOB = '1990-04-12'
let ip = 10
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
const randomKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')

const call = (handler: (r: Request) => Promise<Response>, cookie: string, body: unknown = {}) =>
  handler(
    new Request(`${ORIGIN}/next/members/kyc`, {
      method: 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${ip++}`,
      },
      body: JSON.stringify(body),
    }),
  )

/** An applicant of a kind, signed in, approved unless they say otherwise */
const applicant = async (
  type: 'artist' | 'partner' = 'artist',
  { approved = true }: { approved?: boolean } = {},
) => {
  const { member, application } = await ensureApplication(payload, { email: unique(type), type })
  if (type === 'artist')
    await payload.update({
      collection: 'applications',
      id: application.id,
      data: { about: { legalName: 'Asha Example', dateOfBirth: DOB } } as never,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  if (approved)
    await execute(
      payload,
      sql`UPDATE applications SET stage = 'approved' WHERE id = ${application.id}`,
    )
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, application, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const pdf = (label: string) => Buffer.from(`%PDF-1.7\n% ${label}\n%%EOF\n`)

/** A PAN artist's documents: the second ID, the PAN card and the photo with their code */
const artistDocuments = async (member: Member) => {
  const second = await storeKycDocument(payload, {
    member,
    kind: 'other-id',
    bytes: pdf('a made-up voter ID'),
  })
  return { 'other-id': second.id, ...(await identityPhotos(payload, member, { dateOfBirth: DOB })) }
}

/** A photo taken with a code for this name (and date of birth, for an artist) */
const photoFor = async (member: Member, name: string, dateOfBirth: string | null) => {
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
  return photo.id
}

const recordOf = async (memberId: number) =>
  (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: memberId } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]!

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await removeKycFor(payload, like)
  await execute(
    payload,
    sql`DELETE FROM member_sessions WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(
    payload,
    sql`DELETE FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'kyc-%'`)
}

beforeAll(async () => {
  process.env.KYC_ENCRYPTION_KEY ||= randomKey()
  process.env.KYC_BLIND_INDEX_KEY ||= randomKey()
  payload = await getPayload({ config: await config })
  await cleanup()
  closeApplications = await openApplicationsForTests(payload)
  const email = 'verify-reviewer-test@pjk.co.in'
  reviewer =
    (
      await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        overrideAccess: true,
      })
    ).docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email,
        name: 'Verify test',
        roles: ['kyc-reviewer'] as never,
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      } as never,
      overrideAccess: true,
    }))
})

afterAll(async () => {
  await cleanup()
  await closeApplications()
})

describe('confirm who you are', () => {
  it('is only for an approved applicant', async () => {
    const { cookie } = await applicant('artist', { approved: false })
    const response = await call(saveIdentity, cookie, goodKyc())
    expect(response.status).toBe(409)
    expect(((await response.json()) as { message: string }).message).toBe(VERIFY_ERRORS.notApproved)
  })

  it('saves to finish later, then sends once, and nothing changes after that', async () => {
    const { member, cookie } = await applicant()
    const documents = await artistDocuments(member)
    // Half done: only the PAN, kept for later without the other checks
    const later = await call(saveIdentity, cookie, {
      send: false,
      pan: FAKE.pan,
      panName: FAKE.panName,
    })
    expect(later.status).toBe(200)
    expect(identitySent(await recordOf(member.id))).toBe(false)

    // The PAN is not sent back to the page, so it is left empty and the saved one stands
    const sent = await call(saveIdentity, cookie, { ...goodKyc(documents), pan: '', panName: '' })
    expect(sent.status).toBe(200)
    const record = await recordOf(member.id)
    expect(identitySent(record)).toBe(true)
    expect(record.idMasked).toBe('ABCxxxxx4F')
    expect(record.consentedAt).toBeTruthy()

    const again = await call(saveIdentity, cookie, goodKyc(documents))
    expect(again.status).toBe(409)
    expect(((await again.json()) as { message: string }).message).toBe(VERIFY_ERRORS.closed)
  })

  it('takes a passport and a second ID with the address outside India', async () => {
    const { member, cookie } = await applicant()
    const page = await storeKycDocument(payload, {
      member,
      kind: 'passport-page',
      bytes: await identityPhotoBytes(),
    })
    const licence = await storeKycDocument(payload, {
      member,
      kind: 'other-id',
      bytes: pdf('a made-up driving licence'),
    })
    const proof = await storeKycDocument(payload, {
      member,
      kind: 'address-proof',
      bytes: pdf('a made-up utility bill'),
    })
    const passport = {
      send: true,
      consent: true,
      consentTyped: 'I AGREE',
      noticeVersion: goodKyc().noticeVersion,
      primary: 'passport',
      passportNumber: '123456789',
      passportCountry: 'United Kingdom',
      passportName: 'Asha Example',
      abroadId: 'driving-licence',
      addressOnIdMatches: false,
      addressNote: 'I moved in March.',
      documents: {
        'passport-page': page.id,
        'other-id': licence.id,
        'address-proof': proof.id,
        'identity-photo': await photoFor(member, 'Asha Example', DOB),
      },
    }
    // An expired passport, or one with no date, is refused
    const expired = await call(saveIdentity, cookie, { ...passport, passportExpiry: '2020-01-01' })
    expect(expired.status).toBe(422)
    expect(((await expired.json()) as { errors: object }).errors).toHaveProperty('passportExpiry')
    // A different address needs its reason and a proof of address
    const noProof = await call(saveIdentity, cookie, {
      ...passport,
      passportExpiry: '2034-06-30',
      documents: { ...passport.documents, 'address-proof': undefined },
    })
    expect(((await noProof.json()) as { errors: object }).errors).toHaveProperty(
      'documents.address-proof',
    )

    const sent = await call(saveIdentity, cookie, { ...passport, passportExpiry: '2034-06-30' })
    expect(sent.status).toBe(200)
    const record = await recordOf(member.id)
    expect(record).toMatchObject({
      idType: 'passport',
      passportCountry: 'United Kingdom',
      otherIdKind: 'driving-licence',
      addressOnIdMatches: false,
      addressNote: 'I moved in March.',
    })
    expect(record.idMasked).not.toContain('123456789')
  })

  it('asks a trade partner for their PAN and a photo, nothing more', async () => {
    const { member, cookie } = await applicant('partner')
    const panCard = await storeKycDocument(payload, {
      member,
      kind: 'pan-card',
      bytes: await identityPhotoBytes(),
    })
    const photo = await photoFor(member, FAKE.panName, null)
    const response = await call(
      saveIdentity,
      cookie,
      goodPartnerKyc({ 'pan-card': panCard.id, 'identity-photo': photo }),
    )
    expect(response.status).toBe(200)
    expect(identitySent(await recordOf(member.id))).toBe(true)
  })
})

describe('the team’s check', () => {
  const sentArtist = async () => {
    const a = await applicant()
    expect(
      (await call(saveIdentity, a.cookie, goodKyc(await artistDocuments(a.member)))).status,
    ).toBe(200)
    return { ...a, record: await recordOf(a.member.id) }
  }

  it('marks identity checked once, which readies the agreement', async () => {
    const { member, application, record } = await sentArtist()
    const status = (checked: boolean) =>
      applicationStatus(
        { ...(application as Application), stage: 'approved', type: 'artist' },
        member,
        { sent: true, checked },
      ).key
    expect(status(false)).toBe('checking')

    await markIdentityChecked(payload, { recordId: record.id, actor: reviewer })
    expect(identityChecked(await recordOf(member.id))).toBe(true)
    expect(status(true)).toBe('ready')
    await expect(
      markIdentityChecked(payload, { recordId: record.id, actor: reviewer }),
    ).rejects.toThrow(/already checked/)
  })

  it('sends identity back with a note, and the member can send it again', async () => {
    const { member, cookie, record } = await sentArtist()
    await expect(
      returnIdentity(payload, { recordId: record.id, actor: reviewer, note: ' ' }),
    ).rejects.toThrow(KycError)
    await returnIdentity(payload, {
      recordId: record.id,
      actor: reviewer,
      note: 'The photo of your PAN card is blurred. Please take it again.',
    })
    expect(identitySent(await recordOf(member.id))).toBe(false)
    // Open again: a fresh photo and the rest sent once more
    expect((await call(saveIdentity, cookie, goodKyc(await artistDocuments(member)))).status).toBe(
      200,
    )
  })
})

describe('deleting a draft', () => {
  it('removes an application never sent, and only that', async () => {
    const { member, application, cookie } = await applicant('artist', { approved: false })
    expect((await call(deleteDraftRoute, cookie, { type: 'artist' })).status).toBe(200)
    const left = await payload.count({
      collection: 'applications',
      where: { id: { equals: application.id } },
      overrideAccess: true,
    })
    expect(left.totalDocs).toBe(0)

    const sent = await applicant('artist')
    expect((await call(deleteDraftRoute, sent.cookie, { type: 'artist' })).status).toBe(409)
    expect(member.id).toBeTruthy()
  })
})

describe('payouts abroad', () => {
  const abroad = {
    location: 'abroad',
    holderName: 'Asha Example',
    accountNumber: 'GB82 WEST 1234 5698 7654 32',
    accountNumberConfirm: 'GB82WEST12345698765432',
    bankCountry: 'United Kingdom',
    swift: 'WESTGB2L',
    bankAddress: 'Example Bank, 1 High Street, London',
    currency: 'gbp',
  }

  it('checks an IBAN with its own sum, and a SWIFT code’s length', () => {
    const wrong = bankSchema.safeParse({
      ...abroad,
      accountNumber: 'GB82WEST12345698765433',
      accountNumberConfirm: 'GB82WEST12345698765433',
      swift: 'WEST',
    })
    expect(wrong.success).toBe(false)
    const messages = wrong.error!.issues.map((i) => i.message)
    expect(messages).toContain(BANK_ERRORS.ibanWrong)
    expect(messages).toContain(BANK_ERRORS.swift)
    const right = bankSchema.parse(abroad)
    expect(right).toMatchObject({
      location: 'abroad',
      accountNumber: 'GB82WEST12345698765432',
      currency: 'GBP',
    })
  })

  it('keeps a bank abroad, masked, and only in the artist’s own name', async () => {
    const { member, cookie } = await applicant()
    expect((await call(saveIdentity, cookie, goodKyc(await artistDocuments(member)))).status).toBe(
      200,
    )
    await expect(
      requestBankChange(payload, {
        member,
        bank: bankSchema.parse({ ...goodBank(), holderName: 'Somebody Else Entirely' }),
      }),
    ).rejects.toThrow(BANK_ERRORS.notOwnName)

    await requestBankChange(payload, { member, bank: bankSchema.parse(abroad) })
    const record = await recordOf(member.id)
    expect(record.pendingBank).toMatchObject({
      pendingAccountMasked: 'XXXXXXXXXXXXXXXXXX5432',
      pendingIfscMasked: 'WESTGBxx',
      pendingBankLocation: 'abroad',
      pendingBankCountry: 'United Kingdom',
      pendingCurrency: 'GBP',
    })
    const row = JSON.stringify(record)
    expect(row).not.toContain('GB82WEST12345698765432')
  })
})
