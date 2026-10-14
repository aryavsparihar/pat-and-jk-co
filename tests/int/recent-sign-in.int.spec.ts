// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as dataRequest } from '@/app/(frontend)/next/members/data-request/route'
import { POST as identityCode } from '@/app/(frontend)/next/members/kyc/identity-code/route'
import { GET as readKyc, POST as saveKyc } from '@/app/(frontend)/next/members/kyc/route'
import { POST as changeEmail } from '@/app/(frontend)/next/members/portal/email/route'
import { POST as confirm } from '@/app/(frontend)/next/members/step-up/confirm/route'
import { POST as stepUp } from '@/app/(frontend)/next/members/step-up/route'
import { ensureApplication } from '@/members/accounts'
import { recentlyConfirmed } from '@/members/recent'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { hashOtp } from '@/security/otp'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'

/*
 * Sensitive member actions need a sign-in within the last 30 minutes; past that, a fresh code.
 * Everyone here is made up (@recent.example.test) and removed afterwards.
 */

let payload: Payload
let closeApplications: () => Promise<void>
const DOMAIN = '@recent.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
let ip = 20

const call = (handler: (r: Request) => Promise<Response>, cookie: string, body?: unknown) =>
  handler(
    new Request(`${ORIGIN}/next/members/x`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${ip++}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

/** An artist signed in `minutesAgo` minutes ago */
const artist = async (minutesAgo: number) => {
  const email = `artist-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
  const { member } = await ensureApplication(payload, { email, type: 'artist' })
  const { value, sid } = await createSession(payload, { memberId: member.id })
  await execute(
    payload,
    sql`UPDATE member_sessions SET confirmed_at = now() - make_interval(mins => ${minutesAgo}), created_at = now() - make_interval(mins => ${minutesAgo}) WHERE sid = ${sid}`,
  )
  return { member, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}`, sid }
}

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await execute(
    payload,
    sql`DELETE FROM member_sessions WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(
    payload,
    sql`DELETE FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM login_challenges WHERE email LIKE ${like}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  closeApplications = await openApplicationsForTests(payload)
  await cleanup()
})
afterAll(async () => {
  await cleanup()
  await closeApplications()
})

describe('a recent sign-in', () => {
  it('counts for thirty minutes from sign-in or from a fresh code', () => {
    const now = Date.now()
    const at = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
    expect(recentlyConfirmed({ confirmedAt: at(29), createdAt: at(300) }, now)).toBe(true)
    expect(recentlyConfirmed({ confirmedAt: at(31), createdAt: at(31) }, now)).toBe(false)
    // Sessions from before confirmedAt existed count from sign-in
    expect(recentlyConfirmed({ confirmedAt: null, createdAt: at(10) }, now)).toBe(true)
  })

  it('is needed for identity details, email changes and data requests', async () => {
    const { cookie } = await artist(45)
    for (const [handler, body] of [
      [identityCode, {}],
      [saveKyc, {}],
      [dataRequest, { kind: 'copy' }],
      [changeEmail, { email: `new${DOMAIN}` }],
    ] as const) {
      const response = await call(handler, cookie, body)
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ stepUp: true })
    }
    // Reading the masked view is fine; there are no payout details here to hide
    const read = (await (await call(readKyc, cookie)).json()) as { payoutsLocked: boolean }
    expect(read.payoutsLocked).toBe(false)
  })

  it('is not needed within thirty minutes of signing in', async () => {
    const { cookie } = await artist(5)
    expect((await call(identityCode, cookie, {})).status).toBe(200)
  })

  it('is renewed by a fresh code to the member’s own address, and only by that', async () => {
    const { cookie } = await artist(45)
    const asked = (await (await call(stepUp, cookie, {})).json()) as { challengeId: number }
    await execute(
      payload,
      sql`UPDATE login_challenges SET code_hash = ${hashOtp('482910', String(asked.challengeId))} WHERE id = ${asked.challengeId}`,
    )
    expect(
      (await call(confirm, cookie, { challengeId: asked.challengeId, code: '000000' })).status,
    ).toBe(401)
    expect(
      (await call(confirm, cookie, { challengeId: asked.challengeId, code: '482910' })).status,
    ).toBe(200)
    expect((await call(identityCode, cookie, {})).status).toBe(200)
    // Spent: the same code cannot confirm another session
    const other = await artist(45)
    expect(
      (await call(confirm, other.cookie, { challengeId: asked.challengeId, code: '482910' }))
        .status,
    ).toBe(401)
  })
})
