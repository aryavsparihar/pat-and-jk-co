// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { getFieldsToSign, getPayload, jwtSign, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GET as session } from '@/app/(frontend)/next/session/route'
import { ensureApplication } from '@/members/accounts'
import type { User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession, revokeSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

/*
 * /next/session, the only place a visitor's signed-in state reaches a page: "member", "staff" or
 * no one, never anything about who, never cached, and the hint cookie kept in step with it.
 * Everyone here is made up.
 */

let payload: Payload
let staff: User
const STAFF_EMAIL = 'session-endpoint-test@pjk.co.in'
const DOMAIN = '@session-endpoint.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

/** A staff session token made the way Payload's sign-in makes one, without the email gate */
const staffToken = async (user: User): Promise<string> => {
  const collectionConfig = payload.collections.users.config
  const sid = randomUUID()
  const now = new Date()
  const current = (await payload.db.findOne({
    collection: 'users',
    where: { id: { equals: user.id } },
  })) as unknown as Record<string, unknown> & { sessions?: unknown[] }
  await payload.db.updateOne({
    collection: 'users',
    id: user.id,
    data: {
      ...current,
      sessions: [
        ...(current?.sessions ?? []),
        { id: sid, createdAt: now, expiresAt: new Date(now.getTime() + 3_600_000) },
      ],
    },
    returning: false,
  })
  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: user.email,
    sid,
    user: { ...user, collection: 'users' } as never,
  })
  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration: 3600 })
  return token
}

const ask = (...cookies: string[]) =>
  session(
    new Request(`${ORIGIN}/next/session`, {
      headers: { cookie: cookies.join('; '), 'sec-fetch-site': 'same-origin' },
    }),
  )

const memberCookie = async () => {
  const { member } = await ensureApplication(payload, {
    email: `artist-${randomUUID().slice(0, 8)}${DOMAIN}`,
    type: 'artist',
  })
  const created = await createSession(payload, { memberId: member.id })
  return { member, ...created, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(created.value)}` }
}

const hintOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith('pjk_signed_in='))
    ?.split(';')
    .map((p) => p.trim())

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: STAFF_EMAIL } },
    overrideAccess: true,
  })
  staff =
    found.docs[0] ??
    ((await payload.create({
      collection: 'users',
      data: {
        email: STAFF_EMAIL,
        name: 'Session endpoint test',
        roles: ['editor'],
        status: 'active',
        password: `${randomUUID()}-Aa1!`,
      } as never,
      overrideAccess: true,
    })) as User)
})

afterAll(async () => {
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like}`
  await execute(payload, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(
    payload,
    sql`DELETE FROM security_events WHERE email LIKE ${like} OR email = ${STAFF_EMAIL}`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM users WHERE email = ${STAFF_EMAIL}`)
})

describe('who is signed in, for the header', () => {
  it('says no one, never cached, and clears the hint, for a visitor without a session', async () => {
    const response = await ask()
    expect(await response.json()).toEqual({ as: null })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('cache-control')).toContain('private')
    expect(response.headers.get('vary')).toContain('Cookie')
    expect(hintOf(response)).toContain('Max-Age=0')
  })

  it('says member for a live member session, and sets the hint; nothing about who', async () => {
    const { cookie } = await memberCookie()
    const response = await ask(cookie)
    expect(await response.json()).toEqual({ as: 'member' })
    expect(hintOf(response)?.[0]).toBe('pjk_signed_in=member')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('says no one once the member has signed out, or is suspended', async () => {
    const signedOut = await memberCookie()
    await revokeSession(payload, signedOut.sid, 'signed out')
    expect(await (await ask(signedOut.cookie)).json()).toEqual({ as: null })

    const suspended = await memberCookie()
    await payload.update({
      collection: 'members',
      id: suspended.member.id,
      data: { standing: 'suspended' },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    expect(await (await ask(suspended.cookie)).json()).toEqual({ as: null })
  })

  it('says staff for a live staff session, and staff when both are present', async () => {
    const token = await staffToken(staff)
    const response = await ask(`payload-token=${token}`)
    expect(await response.json()).toEqual({ as: 'staff' })
    expect(hintOf(response)?.[0]).toBe('pjk_signed_in=staff')
    const { cookie } = await memberCookie()
    expect(await (await ask(`payload-token=${token}`, cookie)).json()).toEqual({ as: 'staff' })
  })

  it('says no one for a suspended member of staff, or a forged token', async () => {
    const token = await staffToken(staff)
    await payload.update({
      collection: 'users',
      id: staff.id,
      data: { status: 'suspended' },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    try {
      expect(await (await ask(`payload-token=${token}`)).json()).toEqual({ as: null })
    } finally {
      await payload.update({
        collection: 'users',
        id: staff.id,
        data: { status: 'active' },
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    }
    expect(await (await ask('payload-token=not.a.token')).json()).toEqual({ as: null })
  })

  it('ignores a forged hint: only a real session counts', async () => {
    expect(await (await ask('pjk_signed_in=staff')).json()).toEqual({ as: null })
  })
})
