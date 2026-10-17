// @vitest-environment node
import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload, type Where } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as contactRoute } from '@/app/(frontend)/next/members/portal/contact/route'
import { ensureApplication } from '@/members/accounts'
import { formatMemberId, MEMBER_ID_SEQUENCE } from '@/members/ids'
import type { Member, User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

/*
 * What the security log records beyond sign-ins and decisions: what members save in their
 * accounts, changes to staff accounts and members' standing, and server errors, which would
 * otherwise vanish with Vercel's one-hour logs. Everyone here is made up and removed afterwards.
 */

let payload: Payload
const DOMAIN = '@coverage.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const tag = () => randomBytes(4).toString('hex')

const eventsFor = (where: Where) =>
  payload.find({ collection: 'security-events', where, overrideAccess: true, depth: 0, limit: 20 })

const cleanup = async () => {
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like}`
  await execute(payload, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM users WHERE name = 'Coverage test'`)
  await execute(
    payload,
    sql`DELETE FROM security_events WHERE email LIKE ${like} OR email LIKE 'coverage-%@pjk.co.in' OR detail LIKE '%coverage-boom%'`,
  )
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
})

afterAll(async () => {
  await cleanup()
})

const staff = (roles: string[]) =>
  payload.create({
    collection: 'users',
    data: {
      name: 'Coverage test',
      email: `coverage-${tag()}@pjk.co.in`,
      password: `${randomBytes(18).toString('base64url')}-Aa1!`,
      roles,
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as Promise<User>

describe('the security log records', () => {
  it('a member saving something in their account, under their ID', async () => {
    const { member } = await ensureApplication(payload, {
      email: `artist-${tag()}${DOMAIN}`,
      type: 'artist',
    })
    const [row] = await execute<{ n: string }>(
      payload,
      sql`SELECT nextval(${MEMBER_ID_SEQUENCE.artist}) AS n`,
    )
    const approved = (await payload.update({
      collection: 'members',
      id: member.id,
      data: { artistId: formatMemberId('artist', Number(row.n)) },
      overrideAccess: true,
      context: { issuingMemberId: 'artistId', disableRevalidate: true },
    })) as Member
    const { value } = await createSession(payload, { memberId: member.id })
    const response = await contactRoute(
      new Request(`${ORIGIN}/next/members/portal/contact`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}`,
          'x-forwarded-for': '198.51.100.40',
        },
        body: JSON.stringify({ phone: '9876543210' }),
      }),
    )
    expect(response.status).toBe(200)
    const logged = await eventsFor({
      and: [{ event: { equals: 'portal-saved' } }, { email: { equals: member.email } }],
    })
    expect(logged.docs[0]).toMatchObject({ subject: approved.artistId })
    expect(logged.docs[0].detail).toContain('/next/members/portal/contact')
  })

  it('a new staff account, and every change to someone’s roles or status, with who did it', async () => {
    const admin = await staff(['super-admin'])
    const editor = await staff(['editor'])
    expect(
      (
        await eventsFor({
          and: [
            { event: { equals: 'staff-account-created' } },
            { email: { equals: editor.email } },
          ],
        })
      ).totalDocs,
    ).toBe(1)

    await payload.update({
      collection: 'users',
      id: editor.id,
      data: { roles: ['editor', 'kyc-reviewer'], status: 'suspended' },
      overrideAccess: false,
      user: { ...admin, collection: 'users' } as never,
    })
    const changed = await eventsFor({
      and: [{ event: { equals: 'staff-account-changed' } }, { email: { equals: editor.email } }],
    })
    expect(changed.docs[0]).toMatchObject({ actor: admin.id, subject: editor.staffRef })
    expect(changed.docs[0].detail).toContain('roles editor → editor, kyc-reviewer')
    expect(changed.docs[0].detail).toContain('status active → suspended')
    expect(changed.docs[0].detail).toContain(`by ${admin.email}`)
  })

  it('staff suspending a member and reinstating them', async () => {
    const admin = await staff(['super-admin'])
    const { member } = await ensureApplication(payload, {
      email: `partner-${tag()}${DOMAIN}`,
      type: 'partner',
    })
    for (const standing of ['suspended', 'active'] as const) {
      await payload.update({
        collection: 'members',
        id: member.id,
        data: { standing },
        overrideAccess: false,
        user: { ...admin, collection: 'users' } as never,
      })
    }
    const logged = await eventsFor({
      and: [{ event: { equals: 'member-standing-changed' } }, { email: { equals: member.email } }],
    })
    expect(logged.docs.map((d) => d.detail?.split(' by ')[0]).sort()).toEqual([
      'active → suspended',
      'suspended → active',
    ])
    expect(logged.docs.every((d) => d.actor === admin.id)).toBe(true)
  })

  it('a server error, kept beyond the log’s hour', async () => {
    const { reportErrorsOutsideProduction } = await import('@/observability/errorAlerts')
    reportErrorsOutsideProduction(true)
    try {
      payload.logger.error({ msg: 'coverage-boom: something broke', err: new TypeError('nope') })
      await expect
        .poll(
          async () =>
            (
              await eventsFor({
                and: [{ event: { equals: 'server-error' } }, { detail: { like: 'coverage-boom' } }],
              })
            ).totalDocs,
          { timeout: 10_000 },
        )
        .toBe(1)
      // The same error again within the minute is not recorded twice
      payload.logger.error({ msg: 'coverage-boom: something broke', err: new TypeError('nope') })
      await new Promise((r) => setTimeout(r, 500))
      expect(
        (
          await eventsFor({
            and: [{ event: { equals: 'server-error' } }, { detail: { like: 'coverage-boom' } }],
          })
        ).totalDocs,
      ).toBe(1)
    } finally {
      reportErrorsOutsideProduction(false)
    }
  })
})

describe('housekeeping', () => {
  it('deletes sign-in codes and sessions once they are past keeping, and nothing newer', async () => {
    const { runHousekeeping } = await import('@/security/housekeeping')
    const { member } = await ensureApplication(payload, {
      email: `old-${tag()}${DOMAIN}`,
      type: 'artist',
    })
    const email = member.email
    const [old] = await execute<{ id: number }>(
      payload,
      sql`INSERT INTO login_challenges (email, code_hash, expires_at, audience, purpose, updated_at, created_at)
          VALUES (${email}, 'x', now() - interval '40 days', 'member', 'signin', now(), now()) RETURNING id`,
    )
    const [recent] = await execute<{ id: number }>(
      payload,
      sql`INSERT INTO login_challenges (email, code_hash, expires_at, audience, purpose, updated_at, created_at)
          VALUES (${email}, 'x', now() - interval '2 days', 'member', 'signin', now(), now()) RETURNING id`,
    )
    const { sid: ended } = await createSession(payload, { memberId: member.id })
    const { sid: live } = await createSession(payload, { memberId: member.id })
    await execute(
      payload,
      sql`UPDATE member_sessions SET revoked_at = now() - interval '100 days' WHERE sid = ${ended}`,
    )

    await runHousekeeping(payload)

    const left = await execute<{ id: number }>(
      payload,
      sql`SELECT id FROM login_challenges WHERE id IN (${old.id}, ${recent.id})`,
    )
    expect(left.map((r) => r.id)).toEqual([recent.id])
    const sessions = await execute<{ sid: string }>(
      payload,
      sql`SELECT sid FROM member_sessions WHERE member_id = ${member.id}`,
    )
    expect(sessions.map((s) => s.sid)).toEqual([live])
    await execute(payload, sql`DELETE FROM login_challenges WHERE email = ${email}`)
  })
})
