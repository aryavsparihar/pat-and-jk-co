// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { GET as readApplication } from '@/app/(frontend)/next/members/application/route'
import { POST as uploadDocument } from '@/app/(frontend)/next/members/kyc/document/route'
import { POST as lookUpIfsc } from '@/app/(frontend)/next/members/kyc/ifsc/route'
import { POST as requestCode } from '@/app/(frontend)/next/members/request-code/route'
import { ensureApplication } from '@/members/accounts'
import { createFormToken } from '@/members/formToken'
import { UNAVAILABLE } from '@/members/http'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'

// Blob storage for identity documents, failing: the upload must fail cleanly and keep nothing
vi.mock('@/kyc/documentStore', async (original) => ({
  ...(await original<typeof import('@/kyc/documentStore')>()),
  storeEncrypted: vi.fn(async () => {
    throw new Error(
      'BlobServiceNotAvailable: vercel_blob_rw_FAKEFAKEFAKEFAKE1234 at /var/task/x.js',
    )
  }),
}))

/*
 * When a service we depend on fails (email, the IFSC lookup, document storage, the database),
 * each request says so plainly, gives no internal detail, and loses nothing already saved.
 * Everyone here is made up (@failures.example.test). Cloudflare Turnstile being unreachable is
 * covered in turnstile.int.spec.ts.
 */

let payload: Payload
let closeApplications: () => Promise<void>
const DOMAIN = '@failures.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
let ip = 60

const call = (
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  cookie = '',
  method = 'POST',
) =>
  handler(
    new Request(`${ORIGIN}/next/members/x`, {
      method,
      headers: {
        cookie,
        origin: ORIGIN,
        'x-forwarded-for': `198.51.100.${ip++}`,
        ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      },
      body: method === 'GET' ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    }),
  )

const artist = async () => {
  const email = `artist-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
  const { member, application } = await ensureApplication(payload, { email, type: 'artist' })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, application, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const noDetail = (text: string) => {
  for (const leak of ['Error', 'at /', '.js', 'vercel_blob', 'stack', 'ECONN', 'Drizzle'])
    expect(text).not.toContain(leak)
}

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await execute(
    payload,
    sql`DELETE FROM kyc_documents WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
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
  vi.restoreAllMocks()
  await cleanup()
  await closeApplications()
})

describe('when a service fails', () => {
  it('email: the code request says it could not send, and nothing else', async () => {
    const key = process.env.RESEND_API_KEY
    process.env.RESEND_API_KEY = 're_FAKE_FOR_TESTS_ONLY'
    const send = vi.spyOn(payload, 'sendEmail').mockRejectedValue(new Error('Resend 500: internal'))
    try {
      const response = await call(requestCode, {
        email: `new${DOMAIN}`,
        purpose: 'apply-artist',
        formToken: createFormToken(Date.now() - 5000),
      })
      expect(response.status).toBe(503)
      const text = await response.text()
      expect(text).toMatch(/could not send the code just now/)
      noDetail(text)
    } finally {
      send.mockRestore()
      process.env.RESEND_API_KEY = key
    }
  })

  it('the IFSC lookup: the reply says it is unavailable, so the details are typed by hand', async () => {
    const { cookie } = await artist()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    try {
      const response = await call(lookUpIfsc, { ifsc: 'SBIN0001234' }, cookie)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ found: false, unavailable: true })
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('document storage: the upload fails plainly and keeps nothing', async () => {
    const { member, cookie } = await artist()
    const form = new FormData()
    form.append('kind', 'other-id')
    form.append(
      'file',
      new File([new Uint8Array(Buffer.from('%PDF-1.7\n% made up\n%%EOF\n'))], 'id.pdf', {
        type: 'application/pdf',
      }),
    )
    const error = vi.spyOn(payload.logger, 'error')
    const response = await call(uploadDocument, form, cookie)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(text).toMatch(/could not be saved/)
    noDetail(text)
    // Staff have the detail in the logs, with the token taken out
    expect(JSON.stringify(error.mock.calls)).not.toContain('vercel_blob_rw_FAKE')
    error.mockRestore()
    const kept = await payload.count({
      collection: 'kyc-documents',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
    expect(kept.totalDocs).toBe(0)
  })

  it('the database: a member request says plainly it could not reach our records', async () => {
    const { cookie } = await artist()
    const find = vi
      .spyOn(payload, 'find')
      .mockRejectedValueOnce(new Error('Failed query: select ... connect ECONNREFUSED 10.0.0.1'))
    try {
      const response = await call(readApplication, undefined, cookie, 'GET')
      expect(response.status).toBe(503)
      const body = (await response.json()) as { message: string }
      expect(body.message).toBe(UNAVAILABLE)
      noDetail(JSON.stringify(body))
    } finally {
      find.mockRestore()
    }
  })
})
