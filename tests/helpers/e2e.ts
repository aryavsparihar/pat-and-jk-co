import { randomBytes, randomUUID } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { getFieldsToSign, getPayload, jwtSign, type Payload } from 'payload'

import config from '../../src/payload.config.js'
import { createSession } from '../../src/security/memberSession.js'
import { GATE_COOKIE, MEMBER_COOKIE } from '../../src/security/constants.js'
import { createGateToken } from '../../src/security/gateToken.js'
import { hashOtp } from '../../src/security/otp.js'
import { execute } from '../../src/utilities/sql.js'
import { openApplicationsForTests } from './applicationsOpen.js'

/*
 * Helpers for the end-to-end tests. They talk to the same database as the app under test, to do
 * what a person would do outside the browser: read the code from their email, or be a member of
 * staff. Everyone here is made up, at @e2e.example.test, and removed afterwards.
 */

// The made-up people here must never be emailed for real, nor staff told about them
if (process.env.RESEND_API_KEY) {
  throw new Error(
    'RESEND_API_KEY is set: end-to-end tests must not send email (playwright.config.ts)',
  )
}

export const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'
export const DOMAIN = '@e2e.example.test'
export const CODE = '246810'

let cached: Promise<Payload> | null = null
export const payload = () => (cached ??= getPayload({ config }))

export const uniqueEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}${DOMAIN}`

/** Opens applications for the run; returns the function that puts the switch back */
export const openApplications = async () => openApplicationsForTests(await payload())

/**
 * "Reads the email": once the app has issued a code to this address, sets it to a known one, the
 * way the integration tests do. Waits for the challenge to exist first.
 */
export const knowCode = async (email: string, purpose?: string) => {
  const p = await payload()
  let id: number | undefined
  await expect
    .poll(
      async () => {
        const rows = await execute<{ id: number }>(
          p,
          purpose
            ? sql`SELECT id FROM login_challenges WHERE email = ${email} AND purpose = ${purpose} ORDER BY id DESC LIMIT 1`
            : sql`SELECT id FROM login_challenges WHERE email = ${email} ORDER BY id DESC LIMIT 1`,
        )
        id = rows[0]?.id
        return id
      },
      { timeout: 20_000 },
    )
    .toBeTruthy()
  await execute(
    p,
    sql`UPDATE login_challenges SET code_hash = ${hashOtp(CODE, String(id))} WHERE id = ${id}`,
  )
  return CODE
}

/** Signs in through the page's own code form, as a person would */
export const signInWithCode = async (page: Page, email: string) => {
  await page.getByLabel('Email address').fill(email)
  // The form refuses a submission made the instant it appeared, as a script would
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel('Six-digit code').waitFor()
  await page.getByLabel('Six-digit code').fill(await knowCode(email))
  await page.getByRole('button', { name: 'Continue' }).click()
}

/** A member session in this browser, for tests that are not about signing in */
export const signInAs = async (context: BrowserContext, memberId: number) => {
  const { value } = await createSession(await payload(), { memberId })
  await context.addCookies([{ name: MEMBER_COOKIE, value: encodeURIComponent(value), url: BASE }])
}

const STAFF_EMAIL = 'e2e-staff@pjk.co.in'

/**
 * A member of staff in this browser: a super admin, with a session made the way Payload's sign-in
 * makes one and the admin gate's cookie, so no password or email code is involved.
 */
export const signInAsStaff = async (context: BrowserContext) => {
  const p = await payload()
  let staff = (
    await p.find({
      collection: 'users',
      where: { email: { equals: STAFF_EMAIL } },
      overrideAccess: true,
    })
  ).docs[0]
  staff ??= await p.create({
    collection: 'users',
    data: {
      email: STAFF_EMAIL,
      name: 'E2E staff',
      roles: ['super-admin'],
      status: 'active',
      // Never used to sign in; it only has to meet the password rules
      password: `${randomBytes(18).toString('base64url')}-Aa1!`,
    } as never,
    overrideAccess: true,
  })
  const collectionConfig = p.collections.users.config
  const sid = randomUUID()
  const now = new Date()
  const current = (await p.db.findOne({
    collection: 'users',
    where: { id: { equals: staff.id } },
  })) as unknown as { sessions?: unknown[] }
  await p.db.updateOne({
    collection: 'users',
    id: staff.id,
    data: {
      sessions: [
        ...(current?.sessions ?? []),
        { id: sid, createdAt: now, expiresAt: new Date(now.getTime() + 3_600_000) },
      ],
    },
    returning: false,
  })
  const { token } = await jwtSign({
    fieldsToSign: getFieldsToSign({
      collectionConfig,
      email: STAFF_EMAIL,
      sid,
      user: { ...staff, collection: 'users' } as never,
    }),
    secret: p.secret,
    tokenExpiration: 3600,
  })
  await context.addCookies([
    { name: `${p.config.cookiePrefix}-token`, value: token, url: BASE },
    { name: GATE_COOKIE, value: createGateToken(STAFF_EMAIL).token, url: BASE },
  ])
  return staff
}

/** Fills the first four artist steps through the app's own endpoints, with made-up details */
export const fillEarlySteps = async (page: Page) => {
  // The test runner's TypeScript transform names functions with a __name helper, which the
  // page does not have; give it one before running code there
  await page.evaluate('globalThis.__name = globalThis.__name || ((f) => f)')
  const statuses = await page.evaluate(async () => {
    const post = (url: string, body: unknown) =>
      fetch(url, {
        method: 'POST',
        headers: body instanceof FormData ? {} : { 'content-type': 'application/json' },
        body: body instanceof FormData ? body : JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
    const out: number[] = []
    out.push(
      (
        await post('/next/members/application/step', {
          step: 'about',
          data: {
            legalName: 'Asha Example',
            displayName: 'Asha',
            dateOfBirth: '1990-04-12',
            phone: '98765 43210',
            language: 'English',
          },
        })
      ).status,
    )
    out.push(
      (
        await post('/next/members/application/step', {
          step: 'address',
          data: {
            residence: {
              line1: 'House 1, Example Lane',
              city: 'Kathua',
              district: 'Kathua',
              state: 'Jammu and Kashmir',
              postalCode: '184101',
              country: 'India',
            },
            correspondenceSame: true,
          },
        })
      ).status,
    )
    out.push(
      (
        await post('/next/members/application/step', {
          step: 'practice',
          data: {
            mediums: ['painting'],
            stylesThemes: 'Landscapes of the foothills.',
            yearsPractising: 6,
            bio: 'A painter working in oils and watercolour, mostly outdoors, across the seasons. '.repeat(
              2,
            ),
            priceRange: '25k-1l',
            recognition: [],
          },
        })
      ).status,
    )
    const works = []
    for (const i of [1, 2, 3]) {
      const c = document.createElement('canvas')
      c.width = 1200
      c.height = 900
      const g = c.getContext('2d')!
      g.fillStyle = `hsl(${i * 70} 45% 50%)`
      g.fillRect(0, 0, 1200, 900)
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))
      const f = new FormData()
      f.append('file', new File([blob], `work-${i}.jpg`, { type: 'image/jpeg' }))
      const up = await post('/next/members/portfolio', f)
      works.push({
        image: up.body.image.id,
        title: `Work ${i}`,
        year: 2024,
        medium: 'Oil on canvas',
        widthCm: 60,
        heightCm: 90,
      })
    }
    out.push(
      (await post('/next/members/application/step', { step: 'portfolio', data: { works } })).status,
    )
    return out
  })
  expect(statuses).toEqual([200, 200, 200, 200])
}

/** Makes a member an approved artist (or partner) directly, as an approval would */
export const approveAs = async (memberId: number, kind: 'artist' | 'partner' = 'artist') => {
  const p = await payload()
  const field = kind === 'artist' ? 'artistId' : 'partnerId'
  const id = `${kind === 'artist' ? 'AT' : 'PT'}9${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`
  await p.update({
    collection: 'members',
    id: memberId,
    data: { [field]: id },
    overrideAccess: true,
    context: { issuingMemberId: field, disableRevalidate: true },
  })
  return id
}

/** Everything made by these tests, in the order the database allows */
export const cleanUp = async () => {
  const p = await payload()
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like}`
  await execute(p, sql`DELETE FROM kyc_records WHERE member_id IN (${members})`)
  await execute(p, sql`DELETE FROM kyc_documents WHERE member_id IN (${members})`)
  await execute(p, sql`DELETE FROM artworks WHERE owner_id IN (${members})`)
  await execute(p, sql`DELETE FROM portfolio_images WHERE owner_id IN (${members})`)
  await execute(p, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(p, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(p, sql`DELETE FROM payload_preferences_rels WHERE members_id IN (${members})`)
  await execute(p, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(p, sql`DELETE FROM login_challenges WHERE email LIKE ${like}`)
  await execute(p, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(p, sql`DELETE FROM rate_limits`)
}

export const findMember = async (email: string) =>
  (
    await (
      await payload()
    ).find({
      collection: 'members',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
  ).docs[0]!
