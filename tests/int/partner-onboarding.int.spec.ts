// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as sendPartner } from '@/app/(frontend)/next/members/application/partner/route'
import { POST as newIdentityCode } from '@/app/(frontend)/next/members/kyc/identity-code/route'
import { POST as uploadDocument } from '@/app/(frontend)/next/members/kyc/document/route'
import { identityFingerprint } from '@/kyc/identityCode'
import { kycPurgeCandidates, saveKyc, storeKycDocument } from '@/kyc/service'
import { kycSchema } from '@/kyc/schema'
import { ensureApplication } from '@/members/accounts'
import { createFormToken } from '@/members/formToken'
import { withdrawApplication } from '@/members/withdraw'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'
import {
  FAKE,
  FAKE_CODE,
  goodKyc,
  goodPartnerKyc,
  identityPhotoBytes,
  identityPhotos,
  removeKycFor,
} from '../helpers/kyc'
import { setPartnerAgreement } from '../helpers/partnerAgreement'

/*
 * Part 5, partner onboarding: a partner gives their PAN, the card and the same live photo as an
 * artist (a ten-minute code and their name), agrees to the Partner/Trade Program read to its end,
 * and passes the bot check at the last step. Every address is made up at @partner.example.test,
 * every PAN and code is fake, and everything is removed afterwards.
 */

let payload: Payload
let closeApplications: () => Promise<void>
let restoreAgreement: () => Promise<void>
let ip = 1
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const DOMAIN = '@partner.example.test'
const like = `%${DOMAIN}`
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
const AGREEMENT = {
  version: '2026-11',
  words: 'We work with partners on these terms, in good faith.',
}

const details = {
  category: 'placement',
  subType: 'Art dealer / art consultant',
  fullName: FAKE.panName,
  role: 'Art consultant',
  phone: '+91 98765 43210',
  city: 'Jammu',
  state: 'Jammu and Kashmir',
  interest: 'Finding original work for the collectors I advise.',
  message: 'I advise private collectors in Jammu and Delhi on contemporary work.',
}

const agreed = (version = AGREEMENT.version) => ({ version, readToEnd: true, typed: 'I AGREE' })

const applicant = async (type: 'artist' | 'partner' = 'partner', email = unique(type)) => {
  const { member, application } = await ensureApplication(payload, { email, type })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, application, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const call = (handler: (r: Request) => Promise<Response>, cookie: string, body?: unknown) =>
  handler(
    new Request(`${ORIGIN}/next/members/x`, {
      method: 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'x-forwarded-for': `198.51.100.${ip++}`,
        ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  )

/** What the form sends, after a real pause */
const submission = (extra: Record<string, unknown>) => ({
  data: details,
  agreement: agreed(),
  formToken: createFormToken(Date.now() - 30_000),
  ...extra,
})

/** The PAN card and the photo, taken with a code for this name and no date of birth */
const partnerPhotos = (member: Awaited<ReturnType<typeof applicant>>['member']) =>
  identityPhotos(payload, member, { dateOfBirth: '', name: FAKE.panName })

const errorsOf = async (response: Response) =>
  (await response.json()) as { errors?: Record<string, string>; message?: string }

const cleanup = async () => {
  await removeKycFor(payload, like)
  await execute(
    payload,
    sql`DELETE FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(
    payload,
    sql`DELETE FROM member_sessions WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  closeApplications = await openApplicationsForTests(payload)
  restoreAgreement = await setPartnerAgreement(payload, null)
  await cleanup()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TURNSTILE_SECRET_KEY
})

afterAll(async () => {
  await restoreAgreement()
  await cleanup()
  await closeApplications()
})

describe('until the Partner/Trade Program agreement is published', () => {
  it('nothing can be sent, however complete the application', async () => {
    await setPartnerAgreement(payload, null)
    const { cookie, member, application } = await applicant()
    const response = await call(
      sendPartner,
      cookie,
      submission({ kyc: goodPartnerKyc(await partnerPhotos(member)) }),
    )
    expect(response.status).toBe(409)
    expect((await errorsOf(response)).message).toMatch(/agreement is not ready/)
    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored.stage).toBe('draft')
    // Nothing of their identity was kept either
    const records = await payload.count({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
    expect(records.totalDocs).toBe(0)
  })
})

describe('a partner application, with the agreement published', () => {
  beforeAll(async () => {
    await setPartnerAgreement(payload, AGREEMENT)
  })

  it('lists every problem at once: details, identity and agreement', async () => {
    const { cookie } = await applicant()
    const response = await call(
      sendPartner,
      cookie,
      submission({
        data: { ...details, fullName: '' },
        kyc: { ...goodPartnerKyc({}), pan: 'ABCDE1234', consent: false },
        agreement: { version: AGREEMENT.version, readToEnd: true, typed: 'yes' },
      }),
    )
    expect(response.status).toBe(422)
    const { errors } = await errorsOf(response)
    expect(Object.keys(errors ?? {})).toEqual(
      expect.arrayContaining([
        'fullName',
        'pan',
        'consent',
        'documents.pan-card',
        'documents.identity-photo',
        'agreement',
      ]),
    )
    expect(errors?.agreement).toMatch(/I AGREE/)
  })

  it('needs identity details from a partner who has given none', async () => {
    const { cookie } = await applicant()
    const response = await call(sendPartner, cookie, submission({}))
    expect(response.status).toBe(422)
    expect((await errorsOf(response)).errors?.kyc).toMatch(/PAN/)
  })

  it('is sent with the PAN encrypted, and keeps the agreement version and how it was agreed', async () => {
    const { cookie, member, application } = await applicant()
    const response = await call(
      sendPartner,
      cookie,
      submission({ kyc: goodPartnerKyc(await partnerPhotos(member)) }),
    )
    expect(response.status).toBe(200)

    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored).toMatchObject({
      stage: 'submitted',
      partnerCategory: 'placement',
      partner: { subType: 'Art dealer / art consultant' },
      partnerDeclarations: {
        consentProcessing: true,
        agreementVersion: AGREEMENT.version,
        agreementConfirmation: expect.stringMatching(/to the end.*I AGREE/),
      },
    })
    expect(stored.partnerDeclarations?.agreedAt).toBeTruthy()
    expect(stored.partnerDeclarations?.agreementDigest).toMatch(/^[0-9a-f]{64}$/)

    const [row] = await execute<Record<string, string | null>>(
      payload,
      sql`SELECT pan_sealed, pan_name_sealed, id_masked, id_choice FROM kyc_records WHERE member_id = ${member.id}`,
    )
    // Sealed, never the value; only the mask is readable
    expect(row!.pan_sealed).toBeTruthy()
    expect(row!.pan_sealed).not.toContain(FAKE.pan)
    expect(row!.pan_name_sealed).not.toContain(FAKE.panName)
    expect(row!.id_masked).not.toBe(FAKE.pan)
    // No second ID is asked of a partner
    expect(row!.id_choice).toBeNull()
  })

  it('refuses an agreement read in an earlier version', async () => {
    const { cookie, member } = await applicant()
    const response = await call(
      sendPartner,
      cookie,
      submission({
        kyc: goodPartnerKyc(await partnerPhotos(member)),
        agreement: agreed('2026-10'),
      }),
    )
    expect(response.status).toBe(422)
    expect((await errorsOf(response)).errors?.agreement).toMatch(/changed since you read it/)
  })

  it('refuses a photo whose paper shows another name', async () => {
    const { cookie, member } = await applicant()
    const photos = await identityPhotos(payload, member, { dateOfBirth: '', name: 'Someone Else' })
    const response = await call(sendPartner, cookie, submission({ kyc: goodPartnerKyc(photos) }))
    expect(response.status).toBe(422)
    expect((await errorsOf(response)).errors?.['documents.identity-photo']).toMatch(/new code/)
  })

  it('cannot have its agreement or consent written by the partner', async () => {
    const { member, application } = await applicant()
    await payload.update({
      collection: 'applications',
      id: application.id,
      data: {
        partnerDeclarations: { agreementVersion: 'forged', consentProcessing: true },
      } as never,
      user: { ...member, collection: 'members' } as never,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })
    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored.partnerDeclarations?.agreementVersion ?? null).toBeNull()
  })

  it('takes the photo with a code for the partner application, and only a partner’s documents', async () => {
    const { cookie, member } = await applicant()
    const code = await call(newIdentityCode, cookie, { type: 'partner' })
    expect(code.status).toBe(200)
    const { code: given } = (await code.json()) as { code: string }

    // In the order the page sends them (IdentityPhoto, Upload)
    const bytes = await identityPhotoBytes()
    const form = (kind: string, extra: Record<string, string> = {}) => {
      const f = new FormData()
      f.append('kind', kind)
      f.append('type', 'partner')
      f.append('file', new File([new Uint8Array(bytes)], 'me.jpg', { type: 'image/jpeg' }))
      for (const [k, v] of Object.entries(extra)) f.append(k, v)
      return f
    }
    const photoForm = form('identity-photo', {
      identityCode: given,
      panName: FAKE.panName,
      capturedWith: 'camera',
    })
    const photo = await call(uploadDocument, cookie, photoForm)
    expect(photo.status).toBe(201)

    // The fingerprint is of the name alone: no date of birth is asked of a partner
    const [stored] = await execute<{ identity_fingerprint: string }>(
      payload,
      sql`SELECT identity_fingerprint FROM kyc_documents WHERE member_id = ${member.id} AND kind = 'identity-photo'`,
    )
    expect(stored!.identity_fingerprint).toBe(identityFingerprint(FAKE.panName, null))

    expect((await call(uploadDocument, cookie, form('masked-aadhaar'))).status).toBe(400)
  })

  it('can be sent again, after changes are asked for, keeping the identity details given before', async () => {
    const { cookie, member, application } = await applicant()
    expect(
      (
        await call(
          sendPartner,
          cookie,
          submission({ kyc: goodPartnerKyc(await partnerPhotos(member)) }),
        )
      ).status,
    ).toBe(200)
    await payload.update({
      collection: 'applications',
      id: application.id,
      data: { stage: 'changes-requested', decisionNote: 'Please say more about your clients.' },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    const again = await call(
      sendPartner,
      cookie,
      submission({ data: { ...details, message: `${details.message} Mostly in homes.` } }),
    )
    expect(again.status).toBe(200)
  })

  it('is refused by the bot check, where it is set up, without a token', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }))),
    )
    const { cookie, member, application } = await applicant()
    const response = await call(
      sendPartner,
      cookie,
      submission({
        kyc: goodPartnerKyc(await partnerPhotos(member)),
        [TURNSTILE_FIELD]: 'not-a-real-token',
      }),
    )
    expect(response.status).toBe(400)
    expect(((await response.json()) as { retryCheck?: boolean }).retryCheck).toBe(true)
    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored.stage).toBe('draft')
  })
})

describe('one identity record for someone who is both an artist and a partner', () => {
  beforeAll(async () => {
    await setPartnerAgreement(payload, AGREEMENT)
  })

  it('keeps the artist’s second ID when the partner details are given', async () => {
    const email = unique('both')
    const artist = await applicant('artist', email)
    const artistDocs = await identityPhotos(payload, artist.member, { dateOfBirth: '1990-04-12' })
    const otherId = await storeKycDocument(payload, {
      member: artist.member,
      kind: 'other-id',
      bytes: await identityPhotoBytes(),
    })
    await saveKyc(payload, {
      member: artist.member,
      input: kycSchema.parse(goodKyc({ ...artistDocs, 'other-id': otherId.id })),
      reference: artist.application.reference,
      consent: { noticeVersion: 'test', confirmation: 'test' },
    })

    const partner = await applicant('partner', email)
    expect(
      (
        await call(
          sendPartner,
          partner.cookie,
          submission({ kyc: goodPartnerKyc(await partnerPhotos(partner.member)) }),
        )
      ).status,
    ).toBe(200)

    const record = (
      await payload.find({
        collection: 'kyc-records',
        where: { member: { equals: artist.member.id } },
        overrideAccess: true,
        depth: 0,
      })
    ).docs
    expect(record).toHaveLength(1)
    expect(record[0]).toMatchObject({
      idChoice: 'other',
      otherIdKind: 'passport',
      reference: artist.application.reference,
    })
    const ids = (record[0]!.documents ?? []).map((d) => (typeof d === 'object' ? d.id : d))
    expect(ids).toContain(otherId.id)
    // The artist's PAN card and photo were replaced by the partner's
    expect(ids).not.toContain(artistDocs['identity-photo'])
  })

  it('withdrawing one application keeps what the other still rests on', async () => {
    const email = unique('withdraw')
    const artist = await applicant('artist', email)
    const partner = await applicant('partner', email)
    expect(
      (
        await call(
          sendPartner,
          partner.cookie,
          submission({ kyc: goodPartnerKyc(await partnerPhotos(partner.member)) }),
        )
      ).status,
    ).toBe(200)
    const count = () =>
      payload.count({
        collection: 'kyc-records',
        where: { member: { equals: partner.member.id } },
        overrideAccess: true,
      })

    // The artist draft still stands, so the partner withdrawing deletes nothing
    await withdrawApplication(payload, partner.member, 'partner')
    expect((await count()).totalDocs).toBe(1)

    // With nothing left that needs it, withdrawing the artist application deletes it
    await withdrawApplication(payload, artist.member, 'artist')
    expect((await count()).totalDocs).toBe(0)
  })

  it('the weekly purge waits while the other kind is still live', async () => {
    const email = unique('purge')
    const artist = await applicant('artist', email)
    const partner = await applicant('partner', email)
    expect(
      (
        await call(
          sendPartner,
          partner.cookie,
          submission({ kyc: goodPartnerKyc(await partnerPhotos(partner.member)) }),
        )
      ).status,
    ).toBe(200)
    // The artist application, never sent, untouched for a year
    await execute(
      payload,
      sql`UPDATE applications SET updated_at = now() - interval '365 days' WHERE id = ${artist.application.id}`,
    )

    const due = async () => (await kycPurgeCandidates(payload)).members.map((m) => m.memberId)
    // The partner application is waiting for review: kept
    expect(await due()).not.toContain(partner.member.id)

    // Once that is declined long ago too, both are due, and so is the record
    await execute(
      payload,
      sql`UPDATE applications SET stage = 'rejected', decided_at = now() - interval '200 days' WHERE member_id = ${partner.member.id} AND type = 'partner'`,
    )
    expect(await due()).toContain(partner.member.id)
  })
})

describe('the photo of a partner', () => {
  it('is checked against the name alone, the same way as an artist’s', () => {
    expect(identityFingerprint(FAKE.panName, null)).toBe(identityFingerprint(FAKE.panName, ''))
    expect(identityFingerprint(FAKE.panName, null)).not.toBe(
      identityFingerprint(FAKE.panName, '1990-04-12'),
    )
    expect(FAKE_CODE).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)
  })
})
