// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
} from '@/kyc/service'
import { ensureApplication } from '@/members/accounts'
import type { Member, User } from '@/payload-types'
import { issueChallenge } from '@/security/challenges'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'
import { FAKE, goodKyc, removeKycFor } from '../helpers/kyc'

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
    data: { about: { legalName: 'Asha Example' } } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, application, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

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
    const response = await call(saveKycStep, cookie, goodKyc())
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      kyc: { idMasked: string; bank: { accountMasked: string } }
      completedSteps: string[]
    }
    expect(body.kyc.idMasked).toBe('ABCxxxxx4F')
    expect(body.kyc.bank.accountMasked).toBe('XXXXXXXX4821')
    expect(body.completedSteps).toContain('kyc')
    expect(JSON.stringify(body)).not.toContain(FAKE.account)
    expect(JSON.stringify(body)).not.toContain(FAKE.pan)

    // What a stolen database dump would show
    const row = await rawRecord(member.id)
    expect(row).toBeTruthy()
    for (const secret of [FAKE.pan, FAKE.account, FAKE.ifsc, FAKE.panName]) {
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
    expect(seen).toContain('XXXXXXXX4821')
    expect(seen).not.toMatch(/Sealed|wrappedKey|panIndex|accountIndex/)

    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored.completedSteps).toContain('kyc')
  })

  it('refuses a full Aadhaar number and never stores it', async () => {
    const { member, cookie } = await artist()
    const full = '999988887777'
    const response = await call(saveKycStep, cookie, {
      ...goodKyc(),
      idType: 'aadhaar',
      pan: undefined,
      aadhaarLast4: full,
    })
    expect(response.status).toBe(422)
    const body = (await response.json()) as { errors: Record<string, string> }
    expect(body.errors.aadhaarLast4).toMatch(/only the last four/)
    expect(JSON.stringify(body)).not.toContain(full)
    expect(await rawRecord(member.id)).toBe('')
  })

  it('needs consent, matching account numbers and a personal PAN', async () => {
    const { cookie } = await artist()
    const response = await call(saveKycStep, cookie, {
      ...goodKyc(),
      consent: false,
      pan: 'ABCCE1234F',
      bank: { ...goodKyc().bank, accountNumberConfirm: '999900004822' },
    })
    expect(response.status).toBe(422)
    const { errors } = (await response.json()) as { errors: Record<string, string> }
    expect(Object.keys(errors).sort()).toEqual(['bank.accountNumberConfirm', 'consent', 'pan'])
  })

  it('finds another member with the same PAN without decrypting anything', async () => {
    const first = await artist()
    const second = await artist()
    expect((await call(saveKycStep, first.cookie, goodKyc())).status).toBe(200)
    expect((await call(saveKycStep, second.cookie, goodKyc())).status).toBe(200)
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
    const response = await call(saveKycStep, other.cookie, goodKyc({ 'bank-proof': document.id }))
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('who can see KYC', () => {
  it('not an editor, a member, or anyone through REST', async () => {
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, goodKyc())

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
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, goodKyc())
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

describe('changing bank details after approval', () => {
  it('needs a fresh code, keeps the old details until staff approve, and can be stopped', async () => {
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, goodKyc())
    // Member IDs are only ever issued on approval, so the test sets one directly
    await execute(
      payload,
      sql`UPDATE members SET artist_id = ${`AT9${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`} WHERE id = ${member.id}`,
    )
    const newBank = {
      ...goodKyc().bank,
      accountNumber: FAKE.newAccount,
      accountNumberConfirm: FAKE.newAccount,
    }

    // Without a step-up code: refused, even inside a session
    expect((await call(changeBank, cookie, { bank: newBank })).status).toBe(401)
    const signIn = await issueChallenge(payload, {
      email: member.email,
      ip: '198.51.100.1',
      audience: 'member',
      purpose: 'signin',
      deliverable: true,
    })
    expect(
      (await call(changeBank, cookie, { challengeId: signIn.id, code: signIn.code, bank: newBank }))
        .status,
    ).toBe(401)

    const step = await issueChallenge(payload, {
      email: member.email,
      ip: '198.51.100.1',
      audience: 'member',
      purpose: 'step-up',
      deliverable: true,
    })
    const asked = await call(changeBank, cookie, {
      challengeId: step.id,
      code: step.code,
      bank: newBank,
    })
    expect(asked.status).toBe(200)

    // The old account is still the one in force
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

  it('“this was not me” stops the change and signs the account out', async () => {
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, goodKyc())
    const { requestBankChange } = await import('@/kyc/service')
    const { cancelToken } = await requestBankChange(payload, {
      member: member as Member,
      bank: {
        ...goodKyc().bank,
        accountNumber: FAKE.newAccount,
        accountNumberConfirm: FAKE.newAccount,
        accountType: 'savings',
      },
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
    for (const a of [withdrawn, held, stale, fresh]) await call(saveKycStep, a.cookie, goodKyc())

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
    const { member, cookie } = await artist()
    await call(saveKycStep, cookie, goodKyc())
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
    await call(saveKycStep, cookie, goodKyc())
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
    await call(saveKycStep, cookie, goodKyc())
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
    await call(saveKycStep, cookie, goodKyc())
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
    const { member, cookie } = await artist()
    const pdf = Buffer.from('%PDF-1.7\n% a made-up document\n%%EOF\n')
    const { document } = (await (
      await upload(cookie, 'bank-proof', pdf, 'cheque.pdf', 'application/pdf')
    ).json()) as { document: { id: number } }
    await call(saveKycStep, cookie, goodKyc({ 'bank-proof': document.id }))
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
