// @vitest-environment node
import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload, type Where } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as contactRoute } from '@/app/(frontend)/next/members/portal/contact/route'
import { GET as sessionsRoute } from '@/app/(frontend)/next/members/portal/sessions/route'
import { DELETE as deletePicture } from '@/app/(frontend)/next/members/portfolio/route'
import { POST as stepRoute } from '@/app/(frontend)/next/members/application/step/route'
import { KycError, requestPayoutDetails, saveKyc, storeKycDocument } from '@/kyc/service'
import { ensureApplication } from '@/members/accounts'
import { formatMemberId, MEMBER_ID_SEQUENCE } from '@/members/ids'
import { ingestPortfolioImage } from '@/members/portfolio'
import type { Member, User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession, readSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { FAKE, goodKyc, removeKycFor } from '../helpers/kyc'

/*
 * The admin panel's records, end to end against the database: KYC documents kept with their
 * record, suspending and holding accounts, and the security log recording every addition, change
 * and deletion, by staff, by members and by the site, without ever copying what anyone typed.
 * Everyone here is made up (@adminpanel.example.test, staff named "Admin panel test").
 */

let payload: Payload
let editor: User
let admin: User
let reviewer: User
const DOMAIN = '@adminpanel.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const tag = () => randomBytes(4).toString('hex')
let ip = 20

const staff = (roles: string[]) =>
  payload.create({
    collection: 'users',
    data: {
      name: 'Admin panel test',
      email: `adminpanel-${tag()}@pjk.co.in`,
      password: `${randomBytes(18).toString('base64url')}-Aa1!`,
      roles,
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as Promise<User>

const asStaff = (user: User) => ({ ...user, collection: 'users' }) as never

/** A member with a session; an approved artist unless asked otherwise */
const someone = async (approved = true) => {
  const { member, application } = await ensureApplication(payload, {
    email: `artist-${tag()}${DOMAIN}`,
    type: 'artist',
  })
  let fresh = member as Member
  if (approved) {
    const [row] = await execute<{ n: string }>(
      payload,
      sql`SELECT nextval(${MEMBER_ID_SEQUENCE.artist}) AS n`,
    )
    fresh = (await payload.update({
      collection: 'members',
      id: member.id,
      data: { artistId: formatMemberId('artist', Number(row.n)) },
      overrideAccess: true,
      context: { issuingMemberId: 'artistId', disableRevalidate: true },
    })) as Member
  }
  const { value } = await createSession(payload, { memberId: member.id })
  return {
    member: fresh,
    application,
    session: value,
    cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}`,
  }
}

const request = (method: string, cookie: string, path: string, body?: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      cookie,
      origin: ORIGIN,
      'x-forwarded-for': `198.51.100.${ip++ % 250}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/** POST /api/members/:id/standing, as a given user, through Payload's real request */
const changeStanding = async (user: User | Member, id: number, body: unknown) => {
  const handler = payload.collections.members.config.endpoints
    ? (payload.collections.members.config.endpoints || []).find(
        (e) => e.path === '/:id/standing' && e.method === 'post',
      )!.handler
    : null!
  const collection = 'artistId' in user ? 'members' : 'users'
  const req = await createLocalReq({ user: { ...user, collection } as never }, payload)
  Object.assign(req, { routeParams: { id: String(id) }, json: async () => body })
  return handler(req)
}

const events = (where: Where, limit = 50) =>
  payload.find({
    collection: 'security-events',
    where,
    sort: '-createdAt',
    overrideAccess: true,
    depth: 0,
    limit,
  })

const cleanup = async () => {
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like}`
  await removeKycFor(payload, like)
  await execute(payload, sql`DELETE FROM portfolio_images WHERE owner_id IN (${members})`)
  await execute(payload, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM login_challenges WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM categories WHERE title LIKE 'Admin panel test%'`)
  await execute(payload, sql`DELETE FROM tenants WHERE name = 'Admin panel test brand'`)
  await execute(payload, sql`DELETE FROM users WHERE name = 'Admin panel test'`)
  await execute(
    payload,
    sql`DELETE FROM security_events WHERE email LIKE ${like} OR email LIKE 'adminpanel-%@pjk.co.in' OR detail LIKE '%Admin panel test%' OR detail LIKE '%adminpanel-%'`,
  )
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'portal-%'`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  editor = await staff(['editor'])
  admin = await staff(['super-admin'])
  reviewer = await staff(['kyc-reviewer'])
})

afterAll(async () => {
  await cleanup()
})

describe('KYC documents live with their KYC record', () => {
  it('are not a menu of their own in the admin, nor links on the record', () => {
    const documents = payload.collections['kyc-documents'].config
    expect(documents.admin.hidden).toBe(true)
    const field = payload.collections['kyc-records'].config.fields.find(
      (f) => 'name' in f && f.name === 'documents',
    )
    expect((field?.admin as { hidden?: boolean } | undefined)?.hidden).toBe(true)
  })

  it('are still listed for a KYC reviewer, for the record’s sidebar, and for nobody else', async () => {
    const { member } = await someone()
    const document = await storeKycDocument(payload, {
      member,
      kind: 'other-id',
      bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
    })
    const asReviewer = await payload.find({
      collection: 'kyc-documents',
      where: { id: { in: [document.id] } },
      user: asStaff(reviewer),
      overrideAccess: false,
      depth: 0,
    })
    expect(asReviewer.docs.map((d) => [d.id, d.kind])).toEqual([[document.id, 'other-id']])
    // What the sidebar shows beside each one: never where the ciphertext is, or its key
    expect(asReviewer.docs[0]).not.toHaveProperty('storageKey')
    expect(asReviewer.docs[0]).not.toHaveProperty('wrappedKey')
    await expect(
      payload.find({
        collection: 'kyc-documents',
        user: asStaff(editor),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})

describe('suspending an account, and putting it on hold', () => {
  it('only staff, only with a reason, and never for someone deleted', async () => {
    const { member } = await someone()
    expect(
      (await changeStanding(member, member.id, { standing: 'suspended', reason: 'Long enough' }))
        .status,
    ).toBe(403)
    expect(
      (await changeStanding(editor, member.id, { standing: 'on-hold', reason: 'short' })).status,
    ).toBe(400)
    expect(
      (await changeStanding(editor, member.id, { standing: 'erased', reason: 'Long enough here' }))
        .status,
    ).toBe(400)
    expect(
      (await changeStanding(editor, 999999999, { standing: 'on-hold', reason: 'Long enough here' }))
        .status,
    ).toBe(404)
    // And not by editing the field: it is read-only in the admin, and only the endpoint keeps a reason
    const field = payload.collections.members.config.fields.find(
      (f) => 'name' in f && f.name === 'standing',
    )
    expect((field?.admin as { readOnly?: boolean } | undefined)?.readOnly).toBe(true)
  })

  it('on hold: they stay signed in and can read, every change is refused, and payouts pause', async () => {
    const { member, application, session, cookie } = await someone()
    const document = await storeKycDocument(payload, {
      member,
      kind: 'other-id',
      bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
    })
    const record = await saveKyc(payload, {
      member,
      reference: application.reference,
      input: goodKyc({ 'other-id': document.id }) as never,
      consent: { noticeVersion: 'test', confirmation: 'I AGREE' },
    })
    const response = await changeStanding(editor, member.id, {
      standing: 'on-hold',
      reason: 'Admin panel test: checking a sale',
    })
    expect(response.status).toBe(200)
    const held = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(held).toMatchObject({
      standing: 'on-hold',
      standingReason: 'Admin panel test: checking a sale',
    })
    expect(held.standingChangedAt).toBeTruthy()

    // Still signed in, and can read their account
    expect(await readSession(payload, session)).not.toBeNull()
    expect(
      (await sessionsRoute(request('GET', cookie, '/next/members/portal/sessions'))).status,
    ).toBe(200)

    // Every change refused, with a reason they can act on
    const contact = await contactRoute(
      request('POST', cookie, '/next/members/portal/contact', { phone: '9876501234' }),
    )
    expect(contact.status).toBe(423)
    expect(((await contact.json()) as { message: string }).message).toMatch(/on hold/)
    const step = await stepRoute(
      request('POST', cookie, '/next/members/application/step', { step: 'about', data: {} }),
    )
    expect(step.status).toBe(423)

    // Payouts pause: staff cannot ask for payout details while the hold lasts
    const paused = await requestPayoutDetails(payload, { recordId: record.id, actor: reviewer })
      .then(() => null)
      .catch((e: unknown) => e)
    expect(paused).toBeInstanceOf(KycError)
    expect((paused as KycError).status).toBe(423)

    // Logged with who, and why
    const logged = await events({
      and: [{ event: { equals: 'member-standing-changed' } }, { email: { equals: member.email } }],
    })
    expect(logged.docs[0]).toMatchObject({ actor: editor.id })
    expect(logged.docs[0]?.detail).toBe(
      `active → on-hold by ${editor.email}: Admin panel test: checking a sale`,
    )
  })

  it('suspended: every session ends; restored: everything works again, and the reason goes', async () => {
    const { member, session, cookie } = await someone()
    expect(
      (
        await changeStanding(editor, member.id, {
          standing: 'suspended',
          reason: 'Admin panel test: suspected fraud',
        })
      ).status,
    ).toBe(200)
    expect(await readSession(payload, session)).toBeNull()
    expect(
      (await contactRoute(request('POST', cookie, '/next/members/portal/contact', { phone: '1' })))
        .status,
    ).toBe(401)
    // Already suspended: nothing to do
    expect(
      (
        await changeStanding(editor, member.id, {
          standing: 'suspended',
          reason: 'Admin panel test: again',
        })
      ).status,
    ).toBe(409)

    expect(
      (
        await changeStanding(editor, member.id, {
          standing: 'active',
          reason: 'Admin panel test: cleared',
        })
      ).status,
    ).toBe(200)
    const restored = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(restored.standing).toBe('active')
    expect(restored.standingReason ?? null).toBeNull()
    const fresh = await createSession(payload, { memberId: member.id })
    const saved = await contactRoute(
      request(
        'POST',
        `${MEMBER_COOKIE}=${encodeURIComponent(fresh.value)}`,
        '/next/members/portal/contact',
        {
          phone: '9876501234',
        },
      ),
    )
    expect(saved.status).toBe(200)

    const logged = await events({
      and: [{ event: { equals: 'member-standing-changed' } }, { email: { equals: member.email } }],
    })
    expect(logged.docs.map((d) => d.detail?.split(' by ')[0]).sort()).toEqual([
      'active → suspended',
      'suspended → active',
    ])
  })
})

describe('the security log records every addition, change and deletion', () => {
  it('by staff in the admin: added, changed (which fields), deleted, each with who', async () => {
    // A brand to file it under: the seeded one, or one made for the test on an unseeded database
    const tenant =
      (await payload.find({ collection: 'tenants', limit: 1, overrideAccess: true })).docs[0] ??
      (await payload.create({
        collection: 'tenants',
        data: { name: 'Admin panel test brand', slug: `admin-panel-${tag()}` } as never,
        overrideAccess: true,
      }))
    const created = await payload.create({
      collection: 'categories',
      data: {
        title: `Admin panel test ${tag()}`,
        slug: `admin-panel-${tag()}`,
        tenant: tenant.id,
      } as never,
      user: asStaff(admin),
      overrideAccess: true,
    })
    await payload.update({
      collection: 'categories',
      id: created.id,
      data: { title: `Admin panel test renamed ${tag()}` },
      user: asStaff(admin),
      overrideAccess: true,
    })
    await payload.delete({
      collection: 'categories',
      id: created.id,
      user: asStaff(admin),
      overrideAccess: true,
    })
    const logged = await events({ subject: { equals: `categories ${created.id}` } })
    const byEvent = Object.fromEntries(logged.docs.map((d) => [d.event, d]))
    expect(Object.keys(byEvent).sort()).toEqual([
      'record-changed',
      'record-created',
      'record-deleted',
    ])
    for (const entry of logged.docs) {
      expect(entry.actor).toBe(admin.id)
      expect(entry.detail).toContain(`by ${admin.email}`)
    }
    expect(byEvent['record-created']!.detail).toMatch(
      /^Journal category “Admin panel test .*” added by/,
    )
    expect(byEvent['record-changed']!.detail).toMatch(/changed by .*: Title$/)
    expect(byEvent['record-deleted']!.detail).toMatch(/deleted by/)
  })

  it('a staff account added: which roles, never the password', async () => {
    const someoneNew = await staff(['editor'])
    const logged = await events({
      and: [{ event: { equals: 'record-created' } }, { email: { equals: someoneNew.email } }],
    })
    expect(logged.totalDocs).toBe(1)
    const [changedFields] = (
      await events({
        and: [
          { event: { in: ['record-created', 'record-changed', 'record-deleted'] } },
          { email: { equals: someoneNew.email } },
        ],
      })
    ).docs.map((d) => d.detail ?? '')
    expect(changedFields).not.toMatch(/hash|salt|password/i)
  })

  it('by a member from their account, naming the fields and never what they typed', async () => {
    const { member, cookie } = await someone()
    const phone = `98${String(Date.now()).slice(-8)}`
    const saved = await contactRoute(
      request('POST', cookie, '/next/members/portal/contact', {
        phone,
        contactAddress: { line1: `${tag()} Admin Lane`, city: 'Kathua' },
      }),
    )
    expect(saved.status).toBe(200)
    const logged = await events({
      and: [{ event: { equals: 'record-changed' } }, { email: { equals: member.email } }],
    })
    expect(logged.docs[0]?.detail).toMatch(
      new RegExp(`^Member ${member.artistId} changed by the member, from their account: .*Phone`),
    )
    expect(logged.docs[0]?.detail).toContain('Postal address')
    expect(logged.docs[0]?.subject).toBe(member.artistId)
    // Never the values themselves, anywhere in the log
    const anywhere = await events({ detail: { like: phone } })
    expect(anywhere.totalDocs).toBe(0)
    const street = await events({ detail: { like: 'Admin Lane' } })
    expect(street.totalDocs).toBe(0)
  })

  it('an applicant’s answers saved step by step, under their application reference', async () => {
    const { application, cookie } = await someone(false)
    const legalName = `Asha Adminpaneltest ${tag()}`
    const response = await stepRoute(
      request('POST', cookie, '/next/members/application/step', {
        step: 'about',
        data: {
          legalName,
          displayName: 'Asha',
          dateOfBirth: '1990-04-12',
          phone: '+91 98765 43210',
          language: 'English',
        },
      }),
    )
    expect(response.status).toBe(200)
    const logged = await events({
      and: [
        { event: { equals: 'record-changed' } },
        { subject: { equals: application.reference } },
      ],
    })
    expect(logged.docs[0]?.detail).toMatch(
      new RegExp(
        `^Application ${application.reference} changed by the member, from their account: .*About the artist`,
      ),
    )
    // Their answers themselves are never copied into the log
    expect((await events({ detail: { like: legalName } })).totalDocs).toBe(0)
    expect((await events({ detail: { like: '1990-04-12' } })).totalDocs).toBe(0)
  })

  it('choices show what they were and what they became', async () => {
    const { member } = await someone()
    await payload.update({
      collection: 'members',
      id: member.id,
      data: { standing: 'on-hold' },
      user: asStaff(editor),
      overrideAccess: true,
    })
    const logged = await events({
      and: [{ event: { equals: 'record-changed' } }, { email: { equals: member.email } }],
    })
    expect(logged.docs[0]?.detail).toContain('Standing: active → on-hold')
  })

  it('identity details and documents added, under the member, with nothing from them', async () => {
    const { member, application } = await someone()
    const document = await storeKycDocument(payload, {
      member,
      kind: 'other-id',
      bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
    })
    await saveKyc(payload, {
      member,
      reference: application.reference,
      input: goodKyc({ 'other-id': document.id }) as never,
      consent: { noticeVersion: 'test', confirmation: 'I AGREE' },
    })
    const created = await events({
      and: [{ event: { equals: 'record-created' } }, { email: { equals: member.email } }],
    })
    const details = created.docs.map((d) => d.detail ?? '')
    expect(details).toEqual(
      expect.arrayContaining([
        `KYC document other-id of ${member.artistId} added by the member, from their account`,
        `KYC record ${application.reference} added by the member, from their account`,
      ]),
    )
    for (const secret of [FAKE.pan, FAKE.account])
      expect((await events({ detail: { like: secret } })).totalDocs, secret).toBe(0)
  })

  it('a picture deleted by the member who owns it', async () => {
    const { member, cookie } = await someone()
    const bytes = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 90, g: 120, b: 60 } },
    })
      .jpeg()
      .toBuffer()
    const image = await ingestPortfolioImage(payload, member, bytes)
    const removed = await deletePicture(
      new Request(`${ORIGIN}/next/members/portfolio?id=${image.id}`, {
        method: 'DELETE',
        headers: { cookie, origin: ORIGIN },
      }),
    )
    expect(removed.status).toBe(200)
    const logged = await events({
      and: [
        { event: { in: ['record-created', 'record-deleted'] } },
        { email: { equals: member.email } },
      ],
    })
    const pictures = logged.docs.filter((d) => d.detail?.includes(` of ${member.artistId}`))
    expect(pictures.map((d) => d.event).sort()).toEqual(['record-created', 'record-deleted'])
    expect(pictures.every((d) => d.detail?.includes('by the member, from their account'))).toBe(
      true,
    )
  })

  it('leaves out its own bookkeeping: sign-in codes, sessions, rate limits and the log', async () => {
    const before = await events({ event: { in: ['record-created', 'record-changed'] } }, 1)
    const { member } = await someone(false)
    await createSession(payload, { memberId: member.id })
    const after = await events(
      {
        and: [
          { event: { in: ['record-created', 'record-changed', 'record-deleted'] } },
          {
            createdAt: {
              greater_than_equal: before.docs[0]?.createdAt ?? new Date(0).toISOString(),
            },
          },
        ],
      },
      200,
    )
    for (const entry of after.docs) {
      expect(entry.subject ?? '').not.toMatch(
        /^(member-sessions|login-challenges|rate-limits|security-events|visitor-counts) /,
      )
    }
  })
})
