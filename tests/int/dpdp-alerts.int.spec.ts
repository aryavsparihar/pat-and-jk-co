// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as dataRequest } from '@/app/(frontend)/next/members/data-request/route'
import { ensureApplication } from '@/members/accounts'
import { decideProfile, PortalError, saveContact } from '@/members/profile'
import { unpublishMember } from '@/members/unpublish'
import { labelKycRecord } from '@/kyc/service'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import type { User } from '@/payload-types'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'

/*
 * The founder's data-protection alerts: a copy of one's data asked for, consent withdrawn (with
 * the prompt and the one-click unpublish), personal details changed, and the member ID on a kept
 * KYC record. Everyone here is made up (@dpdp.example.test) and removed afterwards.
 */

let payload: Payload
let closeApplications: () => Promise<void>
let staff: User
const DOMAIN = '@dpdp.example.test'
const STAFF_EMAIL = `zz-dpdp-${Math.random().toString(36).slice(2, 8)}@pjk.co.in`
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
let ip = 40

const artist = async () => {
  const email = `artist-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
  const { member } = await ensureApplication(payload, { email, type: 'artist' })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const ask = (cookie: string, kind: string) =>
  dataRequest(
    new Request(`${ORIGIN}/next/members/data-request`, {
      method: 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${ip++}`,
      },
      body: JSON.stringify({ kind }),
    }),
  )

/** The subjects of the emails sent while `run` runs (logged locally, as no email service is set) */
const subjectsDuring = async (run: () => Promise<unknown>) => {
  const info = vi.spyOn(payload.logger, 'info')
  await run()
  const subjects = info.mock.calls
    .map(([message]) => String(message))
    .filter((m) => m.startsWith('[dev] Email'))
  info.mockRestore()
  return subjects
}

const cleanup = async () => {
  const like = `%${DOMAIN}`
  for (const table of ['member_sessions', 'applications', 'kyc_records'])
    await execute(
      payload,
      sql`DELETE FROM ${sql.raw(table)} WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
    )
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
}

// Where alerts go when the site settings name no inbox (as on CI): one made up for the test
const savedInbox = process.env.CONTACT_INBOX

beforeAll(async () => {
  process.env.CONTACT_INBOX ||= 'alerts@dpdp.example.test'
  payload = await getPayload({ config: await config })
  closeApplications = await openApplicationsForTests(payload)
  await cleanup()
  staff = (await payload.create({
    collection: 'users',
    data: {
      email: STAFF_EMAIL,
      password: 'Quiet-Forest-Lamp-29!',
      name: 'DPDP Test',
      roles: ['super-admin'],
      status: 'active',
    } as never,
    overrideAccess: true,
  })) as User
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  if (savedInbox === undefined) delete process.env.CONTACT_INBOX
  else process.env.CONTACT_INBOX = savedInbox
  await cleanup()
  await payload.delete({ collection: 'users', where: { email: { equals: STAFF_EMAIL } } })
  await closeApplications()
})

describe('data-protection alerts', () => {
  it('tells the founder and staff when someone asks for a copy of their data', async () => {
    const { cookie } = await artist()
    const subjects = await subjectsDuring(async () =>
      expect((await ask(cookie, 'download')).status).toBe(200),
    )
    expect(subjects.some((s) => s.includes('Copy of my data requested'))).toBe(true)
  })

  it('records a withdrawal of consent, alerts staff, and lets them unpublish in one click', async () => {
    const { member, cookie } = await artist()
    await payload.update({
      collection: 'members',
      id: member.id,
      data: { publicProfile: { displayName: 'Asha' }, publicProfileAt: new Date().toISOString() },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    const subjects = await subjectsDuring(async () =>
      expect((await ask(cookie, 'withdraw-consent')).status).toBe(200),
    )
    expect(subjects.some((s) => s.includes('Consent withdrawn'))).toBe(true)
    const withdrawn = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(withdrawn.consentWithdrawal?.withdrawnAt).toBeTruthy()
    expect(withdrawn.consentWithdrawal?.unpublishedAt ?? null).toBeNull()

    await unpublishMember(payload, { memberId: member.id, actor: staff })
    const after = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(after.publicProfile ?? null).toBeNull()
    expect(after.consentWithdrawal?.unpublishedAt).toBeTruthy()
    expect(after.consentWithdrawal?.withdrawnAt).toBe(withdrawn.consentWithdrawal?.withdrawnAt)

    // Not published again while consent stays withdrawn
    await expect(
      decideProfile(payload, { memberId: member.id, decision: 'approve', actor: staff }),
    ).rejects.toBeInstanceOf(PortalError)
  })

  it('cannot have the withdrawal written or cleared by anyone but the server', async () => {
    const { member } = await artist()
    await payload.update({
      collection: 'members',
      id: member.id,
      data: { consentWithdrawal: { withdrawnAt: new Date().toISOString() } } as never,
      user: { ...staff, collection: 'users' } as never,
      overrideAccess: false,
      context: { disableRevalidate: true },
    })
    const stored = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(stored.consentWithdrawal?.withdrawnAt ?? null).toBeNull()
  })

  it('tells the founder and staff when personal details change', async () => {
    const { member } = await artist()
    const subjects = await subjectsDuring(() =>
      saveContact(payload, { ...member, artistId: 'AT-ZZ001' }, { phone: '+91 98765 43210' }),
    )
    expect(subjects.some((s) => s.includes('Changed by AT-ZZ001: their contact details'))).toBe(
      true,
    )
  })

  it('puts the member ID on their KYC record, so a kept record says whose it was', async () => {
    const { member } = await artist()
    await execute(
      payload,
      sql`INSERT INTO kyc_records (member_id, reference, updated_at, created_at) VALUES (${member.id}, 'A-ZZTEST', now(), now())`,
    )
    await labelKycRecord(payload, { id: member.id, artistId: 'AT-ZZ002' })
    const [row] = await execute<{ member_code: string }>(
      payload,
      sql`SELECT member_code FROM kyc_records WHERE member_id = ${member.id}`,
    )
    expect(row!.member_code).toBe('AT-ZZ002')
  })
})
