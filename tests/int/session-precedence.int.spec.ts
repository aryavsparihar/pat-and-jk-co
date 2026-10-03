// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { getFieldsToSign, getPayload, jwtSign, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureApplication } from '@/members/accounts'
import type { User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

/*
 * A browser can carry a staff session and a member session at once: a member of staff who has
 * also tried the artist form. Staff must win in /admin and the staff APIs; members must still
 * never reach /admin. Everyone here is made up.
 */

let payload: Payload
let staff: User
let memberCookie: string
const STAFF_EMAIL = 'precedence-test@pjk.co.in'
const MEMBER_DOMAIN = '@precedence.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

/** A staff session token made the way Payload's sign-in makes one, without the email gate */
const staffToken = async (user: User): Promise<string> => {
  const collectionConfig = payload.collections.users.config
  let sid: string | undefined
  if (collectionConfig.auth.useSessions) {
    sid = randomUUID()
    const now = new Date()
    const current = (await payload.db.findOne({
      collection: 'users',
      where: { id: { equals: user.id } },
    })) as unknown as { sessions?: unknown[] }
    await payload.db.updateOne({
      collection: 'users',
      id: user.id,
      data: {
        sessions: [
          ...(current?.sessions ?? []),
          { id: sid, createdAt: now, expiresAt: new Date(now.getTime() + 3_600_000) },
        ],
      },
      returning: false,
    })
  }
  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: user.email,
    sid,
    user: { ...user, collection: 'users' } as never,
  })
  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration: 3600 })
  return token
}

const staffCookie = (token: string) => `${payload.config.cookiePrefix}-token=${token}`
/** As a browser sends them: the cookies, and Sec-Fetch-Site, which Payload's CSRF check reads */
const headersWith = (...cookies: string[]) =>
  new Headers({ cookie: cookies.join('; '), 'sec-fetch-site': 'same-origin' })

/** Payload leaves canAccessAdmin out of the permissions when it is false */
const reachesAdmin = (permissions: { canAccessAdmin?: boolean }) =>
  permissions.canAccessAdmin === true

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: STAFF_EMAIL } },
    overrideAccess: true,
  })
  staff =
    found.docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email: STAFF_EMAIL,
        name: 'Precedence test',
        roles: ['editor'],
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      } as never,
      overrideAccess: true,
    }))
  const { member } = await ensureApplication(payload, {
    email: `artist-${randomUUID().slice(0, 8)}${MEMBER_DOMAIN}`,
    type: 'artist',
  })
  const { value } = await createSession(payload, { memberId: member.id })
  memberCookie = `${MEMBER_COOKIE}=${encodeURIComponent(value)}`
})

afterAll(async () => {
  const like = `%${MEMBER_DOMAIN}`
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
  await payload.delete({
    collection: 'users',
    where: { email: { equals: STAFF_EMAIL } },
    overrideAccess: true,
  })
})

describe('with both a staff and a member cookie', () => {
  it('the staff session wins, and can reach the admin', async () => {
    const token = await staffToken(staff)
    for (const order of [
      [staffCookie(token), memberCookie],
      [memberCookie, staffCookie(token)],
    ]) {
      const { user, permissions } = await payload.auth({ headers: headersWith(...order) })
      expect(user?.collection).toBe('users')
      expect(user?.email).toBe(STAFF_EMAIL)
      expect(reachesAdmin(permissions)).toBe(true)
    }
  })

  it('the staff APIs see the member of staff', async () => {
    const token = await staffToken(staff)
    const { REST_GET } = await import('@payloadcms/next/routes')
    const response = await REST_GET(config)(
      new Request(`${ORIGIN}/api/users/me`, {
        headers: { cookie: `${memberCookie}; ${staffCookie(token)}`, origin: ORIGIN },
      }),
      { params: Promise.resolve({ slug: ['users', 'me'] }) },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { email: string } | null }
    expect(body.user?.email).toBe(STAFF_EMAIL)
  })

  it('a forged or stale staff token does not hide the member, nor let them in', async () => {
    const { user, permissions } = await payload.auth({
      headers: headersWith(staffCookie('not.a.real-token'), memberCookie),
    })
    expect(user?.collection).toBe('members')
    expect(reachesAdmin(permissions)).toBe(false)
  })
})

describe('with only a member cookie', () => {
  it('the member is recognised, and never reaches the admin', async () => {
    const { user, permissions } = await payload.auth({ headers: headersWith(memberCookie) })
    expect(user?.collection).toBe('members')
    expect(reachesAdmin(permissions)).toBe(false)
  })
})
