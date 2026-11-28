// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as sendPartner } from '@/app/(frontend)/next/members/application/partner/route'
import { ensureApplication } from '@/members/accounts'
import { TRADE_NOTICE_VERSION } from '@/members/applicationNotice'
import { createFormToken } from '@/members/formToken'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'

/*
 * The trade application (the founder's ApplyPartner design, brief of 25 November 2026): one page,
 * no identity documents, consent to how the details are used with I AGREE typed, the details
 * confirmed as true, and the bot check before it is sent. It can be saved and finished later.
 * Every address is made up at @partner.example.test, and everything is removed afterwards.
 */

let payload: Payload
let closeApplications: () => Promise<void>
let ip = 1
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const DOMAIN = '@partner.example.test'
const like = `%${DOMAIN}`
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
const details = {
  subType: 'Art adviser or consultant',
  fullName: 'Asha Verma',
  role: 'Art consultant',
  organisation: 'Verma Interiors',
  phone: '+91 98765 43210',
  country: 'India',
  city: 'Jammu',
  state: 'Jammu and Kashmir',
  gstin: '01ABCDE1234F1ZE',
  proof: 'Council of Architecture CA/2019/12345',
  interest: 'Finding original work for the collectors I advise.',
  message: 'I advise private collectors in Jammu and Delhi on contemporary work.',
}

const applicant = async (email = unique('partner')) => {
  const { member, application } = await ensureApplication(payload, { email, type: 'partner' })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, application, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const call = (cookie: string, body: unknown, headers: Record<string, string> = {}) =>
  sendPartner(
    new Request(`${ORIGIN}/next/members/x`, {
      method: 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${ip++}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  )

/** What the form sends, after a real pause */
const submission = (extra: Record<string, unknown> = {}) => ({
  data: details,
  consent: { checked: true, typed: 'I AGREE' },
  accurate: true,
  formToken: createFormToken(Date.now() - 30_000),
  ...extra,
})

const errorsOf = async (response: Response) =>
  (await response.json()) as { errors?: Record<string, string>; message?: string }

const stored = (id: number) =>
  payload.findByID({ collection: 'applications', id, overrideAccess: true })

const cleanup = async () => {
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
  await cleanup()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TURNSTILE_SECRET_KEY
})

afterAll(async () => {
  await cleanup()
  await closeApplications()
})

describe('a trade application', () => {
  it('lists every problem at once: the answers, consent, I AGREE and the statement', async () => {
    const { cookie } = await applicant()
    const response = await call(
      cookie,
      submission({
        data: { ...details, fullName: '', subType: 'Something else', interest: '' },
        consent: { checked: false, typed: 'yes' },
        accurate: false,
      }),
    )
    expect(response.status).toBe(422)
    const { errors } = await errorsOf(response)
    expect(Object.keys(errors ?? {})).toEqual(
      expect.arrayContaining([
        'fullName',
        'subType',
        'interest',
        'consent',
        'consentTyped',
        'accurate',
      ]),
    )
    expect(errors?.consentTyped).toBe('Please type I AGREE in capitals to confirm.')
    expect(errors?.accurate).toBe('Please confirm that the information is accurate.')
  })

  it('is sent without identity documents, as a placement account, with what was agreed', async () => {
    const { cookie, member, application } = await applicant()
    const response = await call(cookie, submission())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ reference: application.reference })

    expect(await stored(application.id)).toMatchObject({
      stage: 'submitted',
      partnerCategory: 'placement',
      partner: {
        subType: 'Art adviser or consultant',
        country: 'India',
        state: 'Jammu and Kashmir',
        gstin: '01ABCDE1234F1ZE',
        proof: 'Council of Architecture CA/2019/12345',
      },
      partnerDeclarations: {
        consentProcessing: true,
        accurate: true,
        privacyNoticeVersion: TRADE_NOTICE_VERSION,
      },
    })
    // Identity comes after approval: nothing is kept of it now
    const kyc = await payload.count({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
    expect(kyc.totalDocs).toBe(0)
  })

  it('takes a foreign registration or VAT number, and the region the country uses', async () => {
    const { cookie, application } = await applicant()
    const response = await call(
      cookie,
      submission({
        data: {
          ...details,
          phone: '+44 7911 123456',
          country: 'United Kingdom',
          city: 'London',
          state: '',
          gstin: 'gb 123 4567 89',
        },
      }),
    )
    expect(response.status).toBe(200)
    expect((await stored(application.id)).partner).toMatchObject({
      country: 'United Kingdom',
      gstin: 'GB 123 4567 89',
    })
  })

  it('checks a GSTIN in India, and needs the state there', async () => {
    const { cookie } = await applicant()
    const response = await call(
      cookie,
      submission({ data: { ...details, gstin: '01ABCDE1234', state: '' } }),
    )
    expect(response.status).toBe(422)
    const { errors } = await errorsOf(response)
    expect(errors?.gstin).toMatch(/^That GSTIN does not look right/)
    expect(errors?.state).toBeTruthy()
  })

  it('keeps a locked record of the consent: the trade notice, I AGREE, IP, place and time', async () => {
    const { cookie, member, application } = await applicant()
    const before = Date.now()
    const response = await call(cookie, submission(), {
      'x-forwarded-for': '203.0.113.77',
      'x-vercel-ip-city': 'Jammu',
      'x-vercel-ip-country-region': 'JK',
      'x-vercel-ip-country': 'IN',
      'user-agent': 'Consent test browser',
    })
    expect(response.status).toBe(200)

    const [record] = (await stored(application.id)).consentRecord ?? []
    expect(record).toMatchObject({
      consentChecked: true,
      typed: 'I AGREE',
      policyVersion: TRADE_NOTICE_VERSION,
      policySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      ip: '203.0.113.77',
      location: 'Jammu, JK, IN',
      userAgent: 'Consent test browser',
    })
    expect(record!.policyText).toMatch(/To consider your application for a trade account/)
    expect(record!.policyText).toMatch(/The details I have given are true and complete/)
    expect(Date.parse(record!.submittedAt!)).toBeGreaterThanOrEqual(before - 1000)

    // Nobody can rewrite it: not the partner, not staff through the admin
    for (const user of [
      { ...member, collection: 'members' },
      { id: 1, roles: ['owner'], collection: 'users' },
    ]) {
      await payload
        .update({
          collection: 'applications',
          id: application.id,
          data: { consentRecord: [{ ...record, ip: '0.0.0.0', typed: 'forged' }] } as never,
          user: user as never,
          overrideAccess: false,
          context: { disableRevalidate: true },
        })
        .catch(() => null)
    }
    const after = await stored(application.id)
    expect(after.consentRecord).toHaveLength(1)
    expect(after.consentRecord![0]).toMatchObject({ ip: '203.0.113.77', typed: 'I AGREE' })
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
    const after = await stored(application.id)
    expect(after.partnerDeclarations?.agreementVersion ?? null).toBeNull()
  })

  it('can be sent again after changes are asked for', async () => {
    const { cookie, application } = await applicant()
    expect((await call(cookie, submission())).status).toBe(200)
    await payload.update({
      collection: 'applications',
      id: application.id,
      data: { stage: 'changes-requested', decisionNote: 'Please say more about your clients.' },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    const again = await call(
      cookie,
      submission({ data: { ...details, message: `${details.message} Mostly in homes.` } }),
    )
    expect(again.status).toBe(200)
  })

  it('is refused by the bot check, where it is set up, without a good token', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }))),
    )
    const { cookie, application } = await applicant()
    const response = await call(cookie, submission({ [TURNSTILE_FIELD]: 'not-a-real-token' }))
    expect(response.status).toBe(400)
    expect(((await response.json()) as { retryCheck?: boolean }).retryCheck).toBe(true)
    expect((await stored(application.id)).stage).toBe('draft')
  })
})

describe('saving a trade application to finish later', () => {
  it('keeps what is typed, unchecked, without the bot check, and sends nothing', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
    const check = vi.fn(async () => new Response(JSON.stringify({ success: false })))
    vi.stubGlobal('fetch', check)
    const { cookie, application } = await applicant()
    const response = await call(cookie, {
      save: true,
      data: { fullName: '  Asha Verma ', gstin: 'not yet', city: 42, made: 'up' },
      formToken: createFormToken(Date.now() - 30_000),
    })
    expect(response.status).toBe(200)
    expect(check).not.toHaveBeenCalled()

    const after = await stored(application.id)
    expect(after.stage).toBe('draft')
    expect(after.partner).toMatchObject({ fullName: 'Asha Verma', gstin: 'not yet' })
    expect(after.partner?.city ?? null).toBeNull()
    expect(after.partner).not.toHaveProperty('made')
  })

  it('cannot change an application once it is sent', async () => {
    const { cookie, application } = await applicant()
    expect((await call(cookie, submission())).status).toBe(200)
    const response = await call(cookie, {
      save: true,
      data: { fullName: 'Someone else' },
      formToken: createFormToken(Date.now() - 30_000),
    })
    expect(response.status).toBe(409)
    expect((await stored(application.id)).partner?.fullName).toBe('Asha Verma')
  })
})
