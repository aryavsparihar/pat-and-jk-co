// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as cancelBankChange } from '@/app/(frontend)/next/members/kyc/bank-change/cancel/route'
import { POST as changeBank } from '@/app/(frontend)/next/members/kyc/bank-change/route'
import { POST as uploadDocument } from '@/app/(frontend)/next/members/kyc/document/route'
import { GET as readKyc, POST as saveKycStep } from '@/app/(frontend)/next/members/kyc/route'
import { kycPrefix, readEncrypted, storeEncrypted } from '@/kyc/documentStore'
import {
  approveBankChange,
  kycPurgeCandidates,
  openKycDocument,
  purgeKyc,
  runKycPurge,
  revealKyc,
  rotateKycKeys,
  storeKycDocument,
} from '@/kyc/service'
import { ensureApplication } from '@/members/accounts'
import type { Member, User } from '@/payload-types'
import { issueChallenge } from '@/security/challenges'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'
import { FAKE, goodBank, goodKyc, removeKycFor } from '../helpers/kyc'

// The made-up test root stands in for India's CCA roots (scripts/fixtures/make-eaadhaar-fixtures.py)
vi.mock('@/kyc/ccaRoots', async () => {
  const fs = await import('node:fs')
  const p = await import('node:path')
  return {
    CCA_ROOTS_PEM: [
      fs.readFileSync(p.resolve(__dirname, '../fixtures/eaadhaar/test-root.pem'), 'utf8'),
    ],
  }
})
const eaadhaar = (name: string) =>
  readFileSync(path.resolve(__dirname, '../fixtures/eaadhaar', name))

/*
 * KYC end to end: what is stored, who can see it, how a bank change is held, and what is deleted
 * when. Everyone here is made up (@kyc.example.test); keys are generated for this run only.
 */

let payload: Payload
let closeApplications: () => Promise<void>
let reviewer: User
let editor: User
let superAdmin: User
const DOMAIN = '@kyc.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
let ip = 10
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
const randomKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
const savedEnv = { ...process.env }

const artist = async () => {
  const { member, application } = await ensureApplication(payload, {
    email: unique('artist'),
    type: 'artist',
  })
  await payload.update({
    collection: 'applications',
    id: application.id,
    data: { about: { legalName: 'Asha Example', dateOfBirth: '1990-04-12' } } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const { value } = await createSession(payload, { memberId: member.id })
  const cookie = `${MEMBER_COOKIE}=${encodeURIComponent(value)}`
  // Every artist gives a second ID; tests use a made-up passport scan unless they say otherwise
  const passport = await storeKycDocument(payload, {
    member,
    kind: 'other-id',
    bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
  })
  idDocuments.set(cookie, passport.id)
  return { member, application, cookie }
}

/** Approval issues a member ID; tests set one directly */
const approve = (member: Member) =>
  execute(
    payload,
    sql`UPDATE members SET artist_id = ${`AT9${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`} WHERE id = ${member.id}`,
  )

/** A fresh step-up code, as the artist would have from their email */
const stepUp = (member: Member) =>
  issueChallenge(payload, {
    email: member.email,
    ip: '198.51.100.1',
    audience: 'member',
    purpose: 'step-up',
    deliverable: true,
  })

/**
 * An approved artist with payout details in force, the only way they can be: added from the
 * account with a fresh code, then approved by a reviewer after the ₹1 test
 */
const withPayoutDetails = async (
  a: { member: Member; cookie: string },
  account: string = FAKE.account,
) => {
  await approve(a.member)
  const step = await stepUp(a.member)
  const added = await call(changeBank, a.cookie, {
    challengeId: step.id,
    code: step.code,
    bank: goodBank(account),
  })
  expect(added.status).toBe(200)
  await approveBankChange(payload, { recordId: (await recordOf(a.member.id)).id, actor: reviewer })
}

const idDocuments = new Map<string, number>()
/** goodKyc with this artist's own made-up ID attached */
const kycFor = (cookie: string, documents: Record<string, number> = {}) =>
  goodKyc({ 'other-id': idDocuments.get(cookie)!, ...documents })

const call = (handler: (r: Request) => Promise<Response>, cookie: string, body?: unknown) =>
  handler(
    new Request(`${ORIGIN}/next/members/kyc`, {
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

const upload = (cookie: string, kind: string, bytes: Buffer, name: string, type: string) => {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', new File([new Uint8Array(bytes)], name, { type }))
  return call(uploadDocument, cookie, form)
}

const rawRecord = async (memberId: number) =>
  (
    await execute<{ row: string }>(
      payload,
      sql`SELECT row_to_json(k)::text AS row FROM kyc_records k WHERE member_id = ${memberId}`,
    )
  )[0]?.row ?? ''

const recordOf = async (memberId: number) =>
  (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: memberId } },
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]!

const endpoint = (collection: 'kyc-records' | 'kyc-documents', path: string) => {
  const found = (payload.collections[collection].config.endpoints || []).find(
    (e) => e.path === path,
  )
  return found!.handler
}

const staffUser = async (email: string, roles: string[]) =>
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
      name: 'KYC test',
      roles: roles as never,
      status: 'active',
      password: 'Rw8-quiet-Forest-2026!',
    },
    overrideAccess: true,
  }))

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
  await execute(payload, sql`DELETE FROM login_challenges WHERE email LIKE ${like}`)
  await execute(
    payload,
    sql`DELETE FROM security_events WHERE email LIKE ${like}
      OR actor_id IN (SELECT id FROM users WHERE email LIKE 'kyc-%-test@pjk.co.in')
      OR subject IN (SELECT reference FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like}))`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'kyc-%' OR key LIKE 'bank-%'`)
}

beforeAll(async () => {
  process.env.KYC_ENCRYPTION_KEY = randomKey()
  process.env.KYC_BLIND_INDEX_KEY = randomKey()
  delete process.env.KYC_ENCRYPTION_KEY_PREVIOUS
  payload = await getPayload({ config: await config })
  await cleanup()
  closeApplications = await openApplicationsForTests(payload)
  reviewer = await staffUser('kyc-reviewer-test@pjk.co.in', ['kyc-reviewer'])
  editor = await staffUser('kyc-editor-test@pjk.co.in', ['editor'])
  superAdmin = await staffUser('kyc-admin-test@pjk.co.in', ['super-admin'])
})

afterAll(async () => {
  await cleanup()
  await closeApplications()
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        in: [
          'kyc-reviewer-test@pjk.co.in',
          'kyc-editor-test@pjk.co.in',
          'kyc-admin-test@pjk.co.in',
        ],
      },
    },
    overrideAccess: true,
  })
  process.env = { ...savedEnv }
})

describe('saving the KYC step', () => {
  it('stores only ciphertext, masks, and indexes, and replies with the masked view', async () => {
    const { member, cookie, application } = await artist()
    const response = await call(saveKycStep, cookie, kycFor(cookie))
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      kyc: { panMasked: string; bank: unknown }
      completedSteps: string[]
    }
    expect(body.kyc.panMasked).toBe('ABCxxxxx4F')
    expect(body.kyc.bank).toBeNull()
    expect(body.completedSteps).toContain('kyc')
    expect(JSON.stringify(body)).not.toContain(FAKE.pan)

    // What a stolen database dump would show
    const row = await rawRecord(member.id)
    expect(row).toBeTruthy()
    for (const secret of [FAKE.pan, FAKE.panName]) {
      expect(row).not.toContain(secret)
    }

    // And the API never returns the sealed columns, even to a KYC reviewer
    const seen = JSON.stringify(
      (
        await payload.find({
          collection: 'kyc-records',
          where: { member: { equals: member.id } },
          user: reviewer,
          overrideAccess: false,
        })
      ).docs[0],
    )
    expect(seen).toContain('ABCxxxxx4F')
    expect(seen).not.toMatch(/Sealed|wrappedKey|panIndex|accountIndex/)

    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored.completedSteps).toContain('kyc')
  })

  it('takes no bank details with the application, even if they are sent', async () => {
    const { member, cookie } = await artist()
    const response = await call(saveKycStep, cookie, { ...kycFor(cookie), bank: goodBank() })
    expect(response.status).toBe(200)
    const record = await recordOf(member.id)
    expect(record.accountMasked ?? null).toBeNull()
    const row = await rawRecord(member.id)
    for (const secret of [FAKE.account, FAKE.ifsc, 'XXXXXXXX4821'])
      expect(row).not.toContain(secret)
  })

  it('refuses a full Aadhaar number and never stores it', async () => {
    const { member, cookie } = await artist()
    const full = '999988887777'
    const response = await call(saveKycStep, cookie, {
      ...kycFor(cookie),
      idChoice: 'aadhaar',
      aadhaarLast4: full,
    })
    expect(response.status).toBe(422)
    const body = (await response.json()) as { errors: Record<string, string> }
    expect(body.errors.aadhaarLast4).toMatch(/only the last four/)
    expect(JSON.stringify(body)).not.toContain(full)
    expect(await rawRecord(member.id)).toBe('')
  })

  it('needs a PAN from every artist, whichever ID they give', async () => {
    const { cookie } = await artist()
    const response = await call(saveKycStep, cookie, { ...kycFor(cookie), pan: '', panName: '' })
    expect(response.status).toBe(422)
    const { errors } = (await response.json()) as { errors: Record<string, string> }
    expect(errors.pan).toBeTruthy()
    expect(errors.panName).toBeTruthy()
  })

  it('asks for the masked e-Aadhaar and its digits, or another ID and which one', async () => {
    const { cookie } = await artist()
    const aadhaar = await call(saveKycStep, cookie, {
      ...goodKyc(),
      idChoice: 'aadhaar',
    })
    const aadhaarErrors = ((await aadhaar.json()) as { errors: Record<string, string> }).errors
    expect(aadhaarErrors).toHaveProperty(['documents.masked-aadhaar'])
    expect(aadhaarErrors).toHaveProperty(['aadhaarLast4'])

    const other = await call(saveKycStep, cookie, { ...goodKyc(), otherIdKind: undefined })
    const otherErrors = ((await other.json()) as { errors: Record<string, string> }).errors
    expect(otherErrors).toHaveProperty(['documents.other-id'])
    expect(otherErrors).toHaveProperty(['otherIdKind'])
  })

  it('takes another ID as an equal choice, for staff to check by hand', async () => {
    const { member, cookie } = await artist()
    const response = await call(saveKycStep, cookie, kycFor(cookie))
    expect(response.status).toBe(200)
    const { kyc } = (await response.json()) as {
      kyc: { idChoice: string; otherIdKind: string; aadhaarMasked: string | null }
    }
    expect(kyc).toMatchObject({ idChoice: 'other', otherIdKind: 'passport', aadhaarMasked: null })
    expect((await recordOf(member.id)).aadhaarCheck?.result ?? null).toBeNull()
  })

  it('checks the original masked e-Aadhaar, and never keeps its password', async () => {
    const { member, cookie } = await artist()
    const { document } = (await (
      await upload(
        cookie,
        'masked-aadhaar',
        eaadhaar('masked-signed.pdf'),
        'eaadhaar.pdf',
        'application/pdf',
      )
    ).json()) as { document: { id: number } }
    const saved = await call(saveKycStep, cookie, {
      ...goodKyc({ 'masked-aadhaar': document.id }),
      idChoice: 'aadhaar',
      aadhaarLast4: '4821',
      aadhaarPassword: 'ASHA1990',
    })
    expect(saved.status).toBe(200)
    const { kyc } = (await saved.json()) as { kyc: { aadhaarMasked: string } }
    expect(kyc.aadhaarMasked).toBe('XXXX XXXX 4821')

    const record = await recordOf(member.id)
    expect(record.aadhaarCheck?.result).toBe('verified')
    expect(record.aadhaarCheck?.mode).toBe('advisory')
    expect(record.aadhaarCheck?.signer).toMatch(/Unique Identification Authority of India/)

    // The password is nowhere: not in the record, the log, or any table we write
    const row = await rawRecord(member.id)
    expect(row).not.toContain('ASHA1990')
    const [{ hits }] = await execute<{ hits: number }>(
      payload,
      sql`SELECT count(*)::int AS hits FROM security_events WHERE detail LIKE '%ASHA1990%'`,
    )
    expect(hits).toBe(0)
  })

  it('records why it could not verify, and still lets the application go ahead', async () => {
    const { member, cookie } = await artist()
    const { document } = (await (
      await upload(
        cookie,
        'masked-aadhaar',
        eaadhaar('masked-changed-after-signing.pdf'),
        'eaadhaar.pdf',
        'application/pdf',
      )
    ).json()) as { document: { id: number } }
    const saved = await call(saveKycStep, cookie, {
      ...goodKyc({ 'masked-aadhaar': document.id }),
      idChoice: 'aadhaar',
      aadhaarLast4: '1111',
      aadhaarPassword: 'ASHA1990',
    })
    expect(saved.status).toBe(200)
    const check = (await recordOf(member.id)).aadhaarCheck
    expect(check?.result).toBe('not-verified')
    expect(check?.reasons).toMatch(/changed after UIDAI signed it/)
    expect(check?.reasons).toMatch(/last four digits/)
  })

  it('marks a photo or scan for a check by hand', async () => {
    const { member, cookie } = await artist()
    const photo = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 220, g: 220, b: 220 } },
    })
      .jpeg()
      .toBuffer()
    const { document } = (await (
      await upload(cookie, 'masked-aadhaar', photo, 'aadhaar.jpg', 'image/jpeg')
    ).json()) as { document: { id: number } }
    const saved = await call(saveKycStep, cookie, {
      ...goodKyc({ 'masked-aadhaar': document.id }),
      idChoice: 'aadhaar',
      aadhaarLast4: '4821',
    })
    expect(saved.status).toBe(200)
    const check = (await recordOf(member.id)).aadhaarCheck
    expect(check?.result).toBe('manual-review')
    expect(check?.reasons).toMatch(/photo or scan/)
  })

  it('deletes an unmasked copy rather than keep a full Aadhaar number', async () => {
    const { member, cookie } = await artist()
    const { document } = (await (
      await upload(
        cookie,
        'masked-aadhaar',
        eaadhaar('unmasked-signed.pdf'),
        'eaadhaar.pdf',
        'application/pdf',
      )
    ).json()) as { document: { id: number } }
    await call(saveKycStep, cookie, {
      ...goodKyc({ 'masked-aadhaar': document.id }),
      idChoice: 'aadhaar',
      aadhaarLast4: '4821',
      aadhaarPassword: 'ASHA1990',
    })
    const record = await recordOf(member.id)
    expect(record.aadhaarCheck?.result).toBe('not-verified')
    expect(record.aadhaarCheck?.reasons).toMatch(/full Aadhaar number/)
    expect((record.documents ?? []).map((d) => (typeof d === 'object' ? d.id : d))).not.toContain(
      document.id,
    )
    const left = await payload.count({
      collection: 'kyc-documents',
      where: { id: { equals: document.id } },
      overrideAccess: true,
    })
    expect(left.totalDocs).toBe(0)
  })

  it('needs consent and a personal PAN', async () => {
    const { cookie } = await artist()
    const response = await call(saveKycStep, cookie, {
      ...kycFor(cookie),
      consent: false,
      pan: 'ABCCE1234F',
    })
    expect(response.status).toBe(422)
    const { errors } = (await response.json()) as { errors: Record<string, string> }
    expect(Object.keys(errors).sort()).toEqual(['consent', 'pan'])
  })

  it('finds another member with the same PAN without decrypting anything', async () => {
    const first = await artist()
    const second = await artist()
    expect((await call(saveKycStep, first.cookie, kycFor(first.cookie))).status).toBe(200)
    expect((await call(saveKycStep, second.cookie, kycFor(second.cookie))).status).toBe(200)
    const record = await recordOf(second.member.id)
    expect(JSON.stringify(record.duplicates)).toContain(first.application.reference)
  })
})

describe('identity documents', () => {
  it('are encrypted at rest, and images lose their EXIF', async () => {
    const { member, cookie } = await artist()
    const photo = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .withExif({ IFD0: { Artist: 'Example Person' } })
      .jpeg()
      .toBuffer()
    const response = await upload(cookie, 'pan-card', photo, 'pan.jpg', 'image/jpeg')
    expect(response.status).toBe(201)
    const { document } = (await response.json()) as { document: { id: number } }

    const [{ storage_key }] = await execute<{ storage_key: string }>(
      payload,
      sql`SELECT storage_key FROM kyc_documents WHERE id = ${document.id}`,
    )
    const atRest = await readEncrypted(storage_key!)
    expect(atRest.subarray(0, 2).toString()).toBe('v1')
    expect(atRest.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false)
    expect(atRest.includes(Buffer.from('Example Person'))).toBe(false)

    const opened = await openKycDocument(payload, {
      documentId: document.id,
      actor: reviewer,
      reason: 'Checking the PAN card for the application',
    })
    expect(opened.contentType).toBe('image/jpeg')
    expect((await sharp(opened.bytes).metadata()).exif).toBeUndefined()
    expect(member.id).toBeTruthy()
  })

  it('are judged by their bytes, not their name', async () => {
    const { cookie } = await artist()
    const fake = await upload(
      cookie,
      'bank-proof',
      Buffer.from('not a pdf at all'),
      'cheque.pdf',
      'application/pdf',
    )
    expect(fake.status).toBe(422)
    const pdf = Buffer.from('%PDF-1.7\n% a made-up document\n%%EOF\n')
    expect((await upload(cookie, 'bank-proof', pdf, 'cheque.pdf', 'application/pdf')).status).toBe(
      201,
    )
  })

  it('cannot be attached to someone else’s record', async () => {
    const owner = await artist()
    const other = await artist()
    const pdf = Buffer.from('%PDF-1.7\n% a made-up document\n%%EOF\n')
    const { document } = (await (
      await upload(owner.cookie, 'bank-proof', pdf, 'cheque.pdf', 'application/pdf')
    ).json()) as { document: { id: number } }
    const response = await call(
      saveKycStep,
      other.cookie,
      kycFor(other.cookie, { 'bank-proof': document.id }),
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('who can see KYC', () => {
  it('not an editor, a member, or anyone through REST', async () => {
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, kycFor(cookie))

    await expect(
      payload.find({ collection: 'kyc-records', user: editor, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.find({
        collection: 'kyc-records',
        user: { ...member, collection: 'members' } as never,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    const { REST_GET } = await import('@payloadcms/next/routes')
    for (const collection of ['kyc-records', 'kyc-documents']) {
      const response = await REST_GET(config)(
        new Request(`${ORIGIN}/api/${collection}`, { headers: { cookie } }),
        { params: Promise.resolve({ slug: [collection] }) },
      )
      expect([401, 403]).toContain(response.status)
    }

    // A reviewer can list them, masked
    const listed = await payload.find({
      collection: 'kyc-records',
      user: reviewer,
      overrideAccess: false,
    })
    expect(listed.docs.length).toBeGreaterThan(0)
    expect(JSON.stringify(listed.docs)).not.toContain(FAKE.account)
  })

  it('a full reveal needs a reviewer and a reason, and is recorded', async () => {
    const a = await artist()
    const { member, cookie } = a
    await call(saveKycStep, cookie, kycFor(cookie))
    await withPayoutDetails(a)
    const record = await recordOf(member.id)
    const reveal = endpoint('kyc-records', '/:id/reveal')
    const request = (user: unknown, reason: string) =>
      reveal({
        user,
        payload,
        routeParams: { id: String(record.id) },
        json: async () => ({ reason }),
      } as never)

    expect((await request(editor, 'Checking the account before payment')).status).toBe(403)
    expect((await request({ ...member, collection: 'members' }, 'Checking it')).status).toBe(403)
    expect((await request(reviewer, 'why')).status).toBe(400)

    const response = await request(reviewer, 'Checking the account before the first payment')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toMatch(/no-store/)
    const { values } = (await response.json()) as { values: Record<string, string> }
    expect(values.accountNumber).toBe(FAKE.account)
    expect(values.pan).toBe(FAKE.pan)

    const logged = await payload.find({
      collection: 'security-events',
      where: { event: { equals: 'kyc-revealed' } },
      sort: '-createdAt',
      limit: 1,
      overrideAccess: true,
    })
    expect(logged.docs[0]?.detail).toMatch(/before the first payment/)
    expect(JSON.stringify(logged.docs[0])).not.toContain(FAKE.account)
  })
})

describe('payout details, only when a sale needs them', () => {
  it('staff ask an approved artist for them by email, which carries none', async () => {
    const a = await artist()
    await call(saveKycStep, a.cookie, kycFor(a.cookie))
    const record = await recordOf(a.member.id)
    const ask = endpoint('kyc-records', '/:id/request-payout-details')
    const request = (user: unknown) =>
      ask({ user, payload, routeParams: { id: String(record.id) } } as never)

    expect((await request(editor)).status).toBe(403)
    // Not yet approved
    expect((await request(reviewer)).status).toBe(409)

    await approve(a.member)
    const logged = vi.spyOn(payload.logger, 'info')
    expect((await request(reviewer)).status).toBe(200)
    // The email, written to the log here: a link to the account, and nothing about any account
    const email = logged.mock.calls
      .map((c) => String(c[0]))
      .find((m) => m.includes('Add your payout details'))
    logged.mockRestore()
    expect(email).toContain('/account/payouts')
    expect(email).toMatch(/never ask for bank details by email/)
    expect(email).not.toMatch(/\d{9,}/)

    expect((await recordOf(a.member.id)).payoutRequestedAt).toBeTruthy()
    const events = await payload.find({
      collection: 'security-events',
      where: {
        event: { equals: 'kyc-payout-details-requested' },
        subject: { equals: record.reference },
      },
      overrideAccess: true,
    })
    expect(events.docs[0]?.actor).toBeTruthy()

    // Once details are on file, there is nothing to ask for
    await withPayoutDetails(a)
    expect((await request(reviewer)).status).toBe(409)
  })

  it('the first details need a fresh code, are typed twice, and wait for a reviewer', async () => {
    const a = await artist()
    const { member, cookie } = a
    await call(saveKycStep, cookie, kycFor(cookie))

    // Not before approval
    let step = await stepUp(member)
    expect(
      (await call(changeBank, cookie, { challengeId: step.id, code: step.code, bank: goodBank() }))
        .status,
    ).toBe(409)
    await approve(member)

    // Without a step-up code, or with a sign-in code: refused, even inside a session
    expect((await call(changeBank, cookie, { bank: goodBank() })).status).toBe(401)
    const signIn = await issueChallenge(payload, {
      email: member.email,
      ip: '198.51.100.1',
      audience: 'member',
      purpose: 'signin',
      deliverable: true,
    })
    expect(
      (
        await call(changeBank, cookie, {
          challengeId: signIn.id,
          code: signIn.code,
          bank: goodBank(),
        })
      ).status,
    ).toBe(401)

    // The account number typed twice, and the two must match
    step = await stepUp(member)
    const mismatched = await call(changeBank, cookie, {
      challengeId: step.id,
      code: step.code,
      bank: { ...goodBank(), accountNumberConfirm: '999900004822' },
    })
    expect(mismatched.status).toBe(422)
    expect(Object.keys(((await mismatched.json()) as { errors: object }).errors)).toEqual([
      'accountNumberConfirm',
    ])

    step = await stepUp(member)
    expect(
      (await call(changeBank, cookie, { challengeId: step.id, code: step.code, bank: goodBank() }))
        .status,
    ).toBe(200)

    // Held, masked, until a reviewer approves after the ₹1 test
    const masked = (await (
      await readKyc(new Request(`${ORIGIN}/next/members/kyc`, { headers: { cookie } }))
    ).json()) as { kyc: { bank: unknown; pendingBank: { accountMasked: string } } }
    expect(masked.kyc.bank).toBeNull()
    expect(masked.kyc.pendingBank.accountMasked).toBe('XXXXXXXX4821')
    expect(await rawRecord(member.id)).not.toContain(FAKE.account)

    const record = await recordOf(member.id)
    await approveBankChange(payload, { recordId: record.id, actor: reviewer })
    const approved = await recordOf(member.id)
    expect(approved.accountMasked).toBe('XXXXXXXX4821')
    expect(approved.nameMismatch).toBe(false)
    expect(approved.verification?.status).toBe('verified')
  })

  it('a change keeps the old details in force until a reviewer approves it', async () => {
    const a = await artist()
    const { member, cookie } = a
    await call(saveKycStep, cookie, kycFor(cookie))
    await withPayoutDetails(a)

    const step = await stepUp(member)
    expect(
      (
        await call(changeBank, cookie, {
          challengeId: step.id,
          code: step.code,
          bank: goodBank(FAKE.newAccount),
        })
      ).status,
    ).toBe(200)
    const masked = (await (
      await readKyc(new Request(`${ORIGIN}/next/members/kyc`, { headers: { cookie } }))
    ).json()) as {
      kyc: { bank: { accountMasked: string }; pendingBank: { accountMasked: string } }
    }
    expect(masked.kyc.bank.accountMasked).toBe('XXXXXXXX4821')
    expect(masked.kyc.pendingBank.accountMasked).toBe('XXXXXXXX7733')

    const record = await recordOf(member.id)
    await approveBankChange(payload, { recordId: record.id, actor: reviewer })
    const revealed = await revealKyc(payload, {
      recordId: record.id,
      actor: reviewer,
      reason: 'Checking the approved change',
    })
    expect(revealed.accountNumber).toBe(FAKE.newAccount)
    expect(revealed.pendingAccountNumber).toBeUndefined()
  })

  it('“this was not me” stops it and signs the account out', async () => {
    const a = await artist()
    const { member, cookie } = a
    await call(saveKycStep, cookie, kycFor(cookie))
    await withPayoutDetails(a)
    const { requestBankChange } = await import('@/kyc/service')
    const { cancelToken } = await requestBankChange(payload, {
      member: member as Member,
      bank: goodBank(FAKE.newAccount),
    })
    expect((await call(cancelBankChange, '', { token: 'not-the-token' })).status).toBe(404)
    expect((await call(cancelBankChange, '', { token: cancelToken })).status).toBe(200)
    expect((await call(cancelBankChange, '', { token: cancelToken })).status).toBe(404)

    const record = await recordOf(member.id)
    expect(record.pendingBank?.requestedAt ?? null).toBeNull()
    const sessions = await payload.count({
      collection: 'member-sessions',
      where: { and: [{ member: { equals: member.id } }, { revokedAt: { exists: false } }] },
      overrideAccess: true,
    })
    expect(sessions.totalDocs).toBe(0)
    const revealed = await revealKyc(payload, {
      recordId: record.id,
      actor: reviewer,
      reason: 'Checking the stopped change',
    })
    expect(revealed.accountNumber).toBe(FAKE.account)
  })
})

describe('retention and keys', () => {
  it('purges withdrawn consent and stale drafts, but never under a legal hold', async () => {
    const withdrawn = await artist()
    const held = await artist()
    const stale = await artist()
    const fresh = await artist()
    for (const a of [withdrawn, held, stale, fresh])
      await call(saveKycStep, a.cookie, kycFor(a.cookie))

    const now = new Date().toISOString()
    await execute(
      payload,
      sql`UPDATE kyc_records SET consent_withdrawn_at = ${now} WHERE member_id IN (${withdrawn.member.id}, ${held.member.id})`,
    )
    await execute(
      payload,
      sql`UPDATE kyc_records SET legal_hold_until = ${new Date(Date.now() + 86_400_000 * 365).toISOString()} WHERE member_id = ${held.member.id}`,
    )
    await execute(
      payload,
      sql`UPDATE applications SET updated_at = ${new Date(Date.now() - 86_400_000 * 200).toISOString()} WHERE id = ${stale.application.id}`,
    )

    const { members } = await kycPurgeCandidates(payload)
    const due = new Map(members.map((m) => [m.memberId, m.reason]))
    expect(due.get(withdrawn.member.id)).toMatch(/consent withdrawn/)
    expect(due.get(stale.member.id)).toMatch(/unsent/)
    expect(due.has(held.member.id)).toBe(false)
    expect(due.has(fresh.member.id)).toBe(false)

    await purgeKyc(payload, { memberId: withdrawn.member.id, reason: 'test' })
    expect(await rawRecord(withdrawn.member.id)).toBe('')
  })

  it('from a preview, deletes copied rows but never production’s files', async () => {
    const { member } = await artist()
    // A file in production's folder, and a row pointing at it, as a database branched from
    // production would hold
    const env = process.env as Record<string, string | undefined>
    env.VERCEL_ENV = 'production'
    const key = await storeEncrypted(
      `copied-${member.id}.bin`,
      Buffer.from('v1 made-up ciphertext'),
    )
    expect(key.startsWith('kyc/')).toBe(true)
    const row = await payload.create({
      collection: 'kyc-documents',
      data: {
        member: member.id,
        kind: 'bank-proof',
        contentType: 'application/pdf',
        size: 21,
        storageKey: key,
        keyId: 'example',
        wrappedKey: 'v1.example',
      } as never,
      overrideAccess: true,
    })
    await execute(
      payload,
      sql`UPDATE kyc_documents SET created_at = ${new Date(Date.now() - 86_400_000 * 30).toISOString()} WHERE id = ${row.id}`,
    )

    env.VERCEL_ENV = 'preview'
    try {
      expect(kycPrefix()).toBe('preview/kyc/')
      const summary = await runKycPurge(payload)
      expect(summary.failed).toBe(0)
      const left = await payload.count({
        collection: 'kyc-documents',
        where: { id: { equals: row.id } },
        overrideAccess: true,
      })
      expect(left.totalDocs).toBe(0)
    } finally {
      env.VERCEL_ENV = 'production'
    }
    // The file is still there, and production can still read it
    expect((await readEncrypted(key)).toString()).toBe('v1 made-up ciphertext')
    const { deleteEncrypted } = await import('@/kyc/documentStore')
    await deleteEncrypted(key)
    delete env.VERCEL_ENV
  })

  it('rotates the master key without touching the data', async () => {
    const a = await artist()
    const { member, cookie } = a
    await call(saveKycStep, cookie, kycFor(cookie))
    await withPayoutDetails(a)
    const record = await recordOf(member.id)

    process.env.KYC_ENCRYPTION_KEY_PREVIOUS = process.env.KYC_ENCRYPTION_KEY
    process.env.KYC_ENCRYPTION_KEY = randomKey()
    const dry = await rotateKycKeys(payload, { apply: false })
    expect(dry.records).toBeGreaterThan(0)
    const done = await rotateKycKeys(payload, { apply: true })
    expect(done.records).toBe(dry.records)
    expect((await rotateKycKeys(payload, { apply: false })).records).toBe(0)
    const [{ key_id }] = await execute<{ key_id: string }>(
      payload,
      sql`SELECT key_id FROM kyc_records WHERE id = ${record.id}`,
    )
    expect(key_id).toBe(done.current)

    delete process.env.KYC_ENCRYPTION_KEY_PREVIOUS
    const revealed = await revealKyc(payload, {
      recordId: record.id,
      actor: reviewer,
      reason: 'Checking after key rotation',
    })
    expect(revealed.accountNumber).toBe(FAKE.account)
  })
})

describe('consent and legal hold', () => {
  it('cannot be edited by anyone through the API, not even a super admin', async () => {
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, kycFor(cookie))
    const record = await recordOf(member.id)
    expect(record.consentedAt).toBeTruthy()
    for (const data of [
      { consentedAt: null },
      { consentWithdrawnAt: new Date().toISOString() },
      { legalHoldUntil: '2099-01-01T00:00:00.000Z' },
    ]) {
      await expect(
        payload.update({
          collection: 'kyc-records',
          id: record.id,
          data: data as never,
          user: superAdmin,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    }
    const after = await recordOf(member.id)
    expect(after.consentedAt).toBe(record.consentedAt)
    expect(after.consentWithdrawnAt ?? null).toBeNull()
    expect(after.legalHoldUntil ?? null).toBeNull()
  })

  it('a withdrawal received outside the site is recorded with a reason, once', async () => {
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, kycFor(cookie))
    const record = await recordOf(member.id)
    const handler = endpoint('kyc-records', '/:id/record-withdrawal')
    const request = (user: unknown, reason: string) =>
      handler({
        user,
        payload,
        routeParams: { id: String(record.id) },
        json: async () => ({ reason }),
      } as never)

    expect((await request(editor, 'A letter from the artist')).status).toBe(403)
    expect((await request(reviewer, 'letter')).status).toBe(400)
    expect((await request(reviewer, 'Letter from the artist dated 1 October')).status).toBe(200)
    expect((await recordOf(member.id)).consentWithdrawnAt).toBeTruthy()
    expect((await request(reviewer, 'Letter from the artist dated 1 October')).status).toBe(409)

    const logged = await payload.find({
      collection: 'security-events',
      where: {
        and: [
          { event: { equals: 'kyc-consent-withdrawn' } },
          { subject: { equals: record.reference } },
        ],
      },
      overrideAccess: true,
    })
    expect(logged.docs).toHaveLength(1)
    expect(logged.docs[0]?.detail).toMatch(/dated 1 October/)
  })

  it('a legal hold is set and lifted only with a reason, and both are logged', async () => {
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, kycFor(cookie))
    const record = await recordOf(member.id)
    const handler = endpoint('kyc-records', '/:id/legal-hold')
    const request = (user: unknown, until: string | null, reason: string) =>
      handler({
        user,
        payload,
        routeParams: { id: String(record.id) },
        json: async () => ({ until, reason }),
      } as never)

    expect((await request(editor, '2099-01-01', 'Payment records for tax')).status).toBe(403)
    expect((await request(reviewer, '2001-01-01', 'Payment records for tax')).status).toBe(400)
    expect((await request(reviewer, '01/01/2099', 'Payment records for tax')).status).toBe(400)
    expect((await request(reviewer, '2099-01-01', 'Payment records for tax')).status).toBe(200)
    expect((await recordOf(member.id)).legalHoldUntil?.slice(0, 4)).toBe('2099')
    expect((await request(reviewer, null, 'Payments settled with the CA')).status).toBe(200)
    expect((await recordOf(member.id)).legalHoldUntil ?? null).toBeNull()

    const logged = await payload.find({
      collection: 'security-events',
      where: {
        and: [
          { event: { equals: 'kyc-legal-hold-changed' } },
          { subject: { equals: record.reference } },
        ],
      },
      sort: 'createdAt',
      overrideAccess: true,
    })
    expect(logged.docs.map((d) => d.detail)).toEqual([
      expect.stringMatching(/from none to 2099-01-01: Payment records for tax/),
      expect.stringMatching(/from 2099-01-01 to none: Payments settled with the CA/),
    ])
  })
})

describe('the admin’s API tab for a KYC record', () => {
  it('shows neither plaintext nor ciphertext nor keys, documents included', async () => {
    const a = await artist()
    const { member, cookie } = a
    const pdf = Buffer.from('%PDF-1.7\n% a made-up document\n%%EOF\n')
    const { document } = (await (
      await upload(cookie, 'bank-proof', pdf, 'cheque.pdf', 'application/pdf')
    ).json()) as { document: { id: number } }
    await call(saveKycStep, cookie, kycFor(cookie, { 'bank-proof': document.id }))
    await withPayoutDetails(a)
    const record = await recordOf(member.id)

    // What the API tab fetches: the record through REST, as the signed-in reviewer
    const seen = JSON.stringify(
      await payload.findByID({
        collection: 'kyc-records',
        id: record.id,
        depth: 2,
        user: reviewer,
        overrideAccess: false,
      }),
    )

    for (const plaintext of [FAKE.pan, FAKE.panName, FAKE.account, FAKE.ifsc, 'Example Branch']) {
      expect(seen).not.toContain(plaintext)
    }
    const [raw] = await execute<Record<string, string | null>>(
      payload,
      sql`SELECT key_id, wrapped_key, pan_sealed, pan_name_sealed, account_number_sealed, ifsc_sealed, holder_name_sealed, branch_name_sealed, pan_index, account_index FROM kyc_records WHERE id = ${record.id}`,
    )
    for (const [column, value] of Object.entries(raw!)) {
      if (value) expect(seen, column).not.toContain(value)
    }
    const [doc] = await execute<Record<string, string>>(
      payload,
      sql`SELECT storage_key, key_id, wrapped_key FROM kyc_documents WHERE id = ${document.id}`,
    )
    for (const [column, value] of Object.entries(doc!)) expect(seen, column).not.toContain(value)
    expect(seen).not.toMatch(
      /Sealed|wrappedKey|keyId|panIndex|accountIndex|cancelTokenHash|storageKey/,
    )
    expect(seen).toContain('XXXXXXXX4821')
  })
})
