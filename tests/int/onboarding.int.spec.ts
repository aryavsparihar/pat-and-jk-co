// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as savePartner } from '@/app/(frontend)/next/members/application/partner/route'
import { GET as getApplication } from '@/app/(frontend)/next/members/application/route'
import { POST as saveStep } from '@/app/(frontend)/next/members/application/step/route'
import { POST as submitArtist } from '@/app/(frontend)/next/members/application/submit/route'
import { POST as saveKycStep } from '@/app/(frontend)/next/members/kyc/route'
import { POST as uploadPicture } from '@/app/(frontend)/next/members/portfolio/route'
import { POST as requestCode } from '@/app/(frontend)/next/members/request-code/route'
import { ensureApplication } from '@/members/accounts'
import { decideApplication } from '@/members/decide'
import { checkFormToken, createFormToken } from '@/members/formToken'
import { cleanImage, isOwnIncomingBlob, PortfolioError } from '@/members/portfolio'
import { createSession } from '@/security/memberSession'
import { MEMBER_COOKIE } from '@/security/constants'
import type { User } from '@/payload-types'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'
import { goodKyc, removeKycFor } from '../helpers/kyc'

/*
 * The onboarding, through the real route handlers: saving steps, pictures, sending, and the
 * partner form. Everyone here is made up (@example.test) and everything created is removed.
 */

let payload: Payload
let closeApplications: () => Promise<void>
let staff: User
const DOMAIN = '@example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
let ip = 40
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`

/** A signed-in applicant of a kind, and their cookie */
const applicant = async (type: 'artist' | 'partner') => {
  const { member, application } = await ensureApplication(payload, { email: unique(type), type })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, application, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const call = (
  handler: (r: Request) => Promise<Response>,
  cookie: string,
  body?: unknown,
  init: RequestInit = {},
) =>
  handler(
    new Request(`${ORIGIN}/next/members/x`, {
      method: 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'x-forwarded-for': `198.51.100.${ip++}`,
        ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
      ...init,
    }),
  )

/** A believable photograph of a work: a gradient, 1200 × 900, as a JPEG with EXIF and GPS */
const photo = (format: 'jpeg' | 'png' = 'jpeg', width = 1200, height = 900) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .withExif({ IFD0: { Copyright: 'Example camera owner', Artist: 'Example Person' } })
    [format]()
    .toBuffer()

const upload = async (cookie: string, bytes: Buffer, name = 'work.jpg', type = 'image/jpeg') => {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(bytes)], name, { type }))
  return call(uploadPicture, cookie, form)
}

const goodSteps = {
  about: {
    legalName: 'Asha Example',
    displayName: 'Asha',
    dateOfBirth: '1990-04-12',
    phone: '98765 43210',
    language: 'English',
  },
  address: {
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
  practice: {
    mediums: ['painting'],
    stylesThemes: 'Landscapes of the Shivalik foothills.',
    yearsPractising: 6,
    bio: 'A painter working in oils and watercolour, mostly outdoors, across the seasons. '.repeat(
      2,
    ),
    priceRange: '25k-1l',
    recognition: [{ kind: 'exhibition', title: 'Foothills', venue: 'A town hall', year: 2024 }],
  },
  review: { originalWork: true, accurate: true, consentProcessing: true },
}

const cleanup = async () => {
  const like = `%${DOMAIN}`
  const images = await payload.find({
    collection: 'portfolio-images',
    where: { 'owner.email': { like: DOMAIN } },
    limit: 500,
    overrideAccess: true,
    depth: 0,
  })
  for (const image of images.docs)
    await payload.delete({ collection: 'portfolio-images', id: image.id, overrideAccess: true })
  await removeKycFor(payload, like)
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
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(
    payload,
    sql`DELETE FROM rate_limits WHERE key LIKE 'member-%' OR key LIKE 'portfolio-%' OR key LIKE 'application-%'`,
  )
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  closeApplications = await openApplicationsForTests(payload)
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: 'onboarding-test@pjk.co.in' } },
    overrideAccess: true,
  })
  staff =
    found.docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email: 'onboarding-test@pjk.co.in',
        name: 'Onboarding test',
        roles: ['super-admin'],
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      },
      overrideAccess: true,
    }))
})

afterAll(async () => {
  await cleanup()
  await closeApplications()
  await payload.delete({
    collection: 'users',
    where: { email: { equals: 'onboarding-test@pjk.co.in' } },
    overrideAccess: true,
  })
})

describe('the form-start token', () => {
  it('tells a person from a script that posts at once', () => {
    expect(checkFormToken(createFormToken(Date.now() - 10_000))).toBe('ok')
    expect(checkFormToken(createFormToken())).toBe('too-fast')
    expect(checkFormToken(createFormToken(Date.now() - 2 * 86_400_000))).toBe('expired')
    const [issued] = createFormToken(Date.now() - 10_000).split('.')
    expect(checkFormToken(`${issued}.forged`)).toBe('forged')
    expect(checkFormToken(undefined)).toBe('missing')
  })

  it('makes a code request without one start again, and quietly ignores an instant one', async () => {
    const email = unique('timing')
    const missing = await call(requestCode, '', { email, purpose: 'apply-artist' })
    expect(missing.status).toBe(400)
    const instant = await call(requestCode, '', {
      email,
      purpose: 'apply-artist',
      formToken: createFormToken(),
    })
    expect(instant.status).toBe(200)
    const challenges = await payload.count({
      collection: 'login-challenges',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
    expect(challenges.totalDocs).toBe(0)
  })
})

describe('pictures of the work', () => {
  it('are cleaned: EXIF gone, re-encoded as JPEG, size capped', async () => {
    const original = await photo('jpeg', 5000, 3000)
    expect((await sharp(original).metadata()).exif).toBeDefined()
    const { data, width } = await cleanImage(original)
    const meta = await sharp(data).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.exif).toBeUndefined()
    expect(width).toBe(4000)
  })

  it('are judged by their bytes, not their name', async () => {
    const png = await photo('png')
    expect((await sharp((await cleanImage(png)).data).metadata()).format).toBe('jpeg')
    await expect(
      cleanImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toBeInstanceOf(PortfolioError)
    await expect(cleanImage(Buffer.from('GIF89a not really'))).rejects.toBeInstanceOf(
      PortfolioError,
    )
    await expect(cleanImage(await photo('jpeg', 400, 300))).rejects.toThrow(/small/)
  })

  it('are only imported from this artist’s own folder in our Blob store', () => {
    const member = { id: 42 }
    expect(
      isOwnIncomingBlob(
        'https://abc123.public.blob.vercel-storage.com/incoming/42/work-x.jpg',
        member,
      ),
    ).toBe(true)
    for (const url of [
      'https://abc123.public.blob.vercel-storage.com/incoming/43/work-x.jpg',
      'https://abc123.public.blob.vercel-storage.com/incoming/42/../43/x.jpg',
      'https://evil.example/incoming/42/x.jpg',
      'http://abc123.public.blob.vercel-storage.com/incoming/42/x.jpg',
      'https://169.254.169.254/latest/meta-data',
      'not a url',
    ]) {
      expect(isOwnIncomingBlob(url, member)).toBe(false)
    }
  })

  it('upload through the endpoint, and nobody else can use them', async () => {
    const a = await applicant('artist')
    const b = await applicant('artist')
    const response = await upload(a.cookie, await photo())
    expect(response.status).toBe(201)
    const { image } = (await response.json()) as { image: { id: number } }

    const fake = await upload(a.cookie, Buffer.from('not an image at all'), 'work.jpg')
    expect(fake.status).toBe(422)

    // B cannot put A's picture in their portfolio
    const work = {
      image: image.id,
      title: 'Theirs',
      year: 2024,
      medium: 'Oil',
      widthCm: 30,
      heightCm: 40,
    }
    const stolen = await call(saveStep, b.cookie, {
      step: 'portfolio',
      data: { works: [work, work, work] },
    })
    expect(stolen.status).toBe(422)
  })
})

describe('an artist application', () => {
  it('saves step by step, explains what needs another look, and can be resumed', async () => {
    const { cookie } = await applicant('artist')
    const bad = await call(saveStep, cookie, {
      step: 'about',
      data: { ...goodSteps.about, dateOfBirth: '2015-01-01' },
    })
    expect(bad.status).toBe(422)
    expect(((await bad.json()) as { errors: Record<string, string> }).errors.dateOfBirth).toMatch(
      /18/,
    )

    const good = await call(saveStep, cookie, { step: 'about', data: goodSteps.about })
    expect(good.status).toBe(200)

    // Resuming in another browser: everything saved comes back, phone in E.164
    const resumed = await getApplication(
      new Request(`${ORIGIN}/next/members/application?type=artist`, { headers: { cookie } }),
    )
    const { application, remaining } = (await resumed.json()) as {
      application: { about: { phone: string; legalName: string }; completedSteps: string[] }
      remaining: string[]
    }
    expect(application.about.legalName).toBe('Asha Example')
    expect(application.about.phone).toBe('+919876543210')
    expect(application.completedSteps).toEqual(['about'])
    expect(remaining).toEqual(
      expect.arrayContaining(['address', 'practice', 'portfolio', 'review']),
    )
  })

  it('cannot be sent until every step is right, then cannot be changed', async () => {
    const { cookie, application } = await applicant('artist')
    const early = await call(submitArtist, cookie, {})
    expect(early.status).toBe(422)

    for (const step of ['about', 'address', 'practice'] as const) {
      expect((await call(saveStep, cookie, { step, data: goodSteps[step] })).status).toBe(200)
    }
    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      const response = await upload(cookie, await photo())
      ids.push(((await response.json()) as { image: { id: number } }).image.id)
    }
    const works = ids.map((image, i) => ({
      image,
      title: `Work ${i + 1}`,
      year: 2024,
      medium: 'Oil on canvas',
      widthCm: 60,
      heightCm: 90,
    }))
    expect((await call(saveStep, cookie, { step: 'portfolio', data: { works } })).status).toBe(200)
    // Identity and bank details go through their own endpoint, encrypted (tests/int/kyc.int.spec.ts)
    expect((await call(saveStep, cookie, { step: 'kyc', data: {} })).status).toBeGreaterThanOrEqual(
      400,
    )
    expect((await call(saveKycStep, cookie, goodKyc())).status).toBe(200)
    expect((await call(saveStep, cookie, { step: 'review', data: goodSteps.review })).status).toBe(
      200,
    )

    const sent = await call(submitArtist, cookie, {})
    expect(sent.status).toBe(200)
    expect(((await sent.json()) as { reference: string }).reference).toBe(application.reference)

    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored.stage).toBe('submitted')
    expect(stored.submittedAt).toBeTruthy()
    expect(stored.declarations?.privacyNoticeVersion).toBeTruthy()

    expect((await call(saveStep, cookie, { step: 'about', data: goodSteps.about })).status).toBe(
      409,
    )
    expect((await call(submitArtist, cookie, {})).status).toBe(409)

    const logged = await payload.count({
      collection: 'security-events',
      where: {
        and: [
          { event: { equals: 'application-submitted' } },
          { subject: { equals: application.reference } },
        ],
      },
      overrideAccess: true,
    })
    expect(logged.totalDocs).toBe(1)
  })

  it('opens again when staff ask for changes, and can be sent again', async () => {
    const { cookie, application } = await applicant('artist')
    await payload.update({
      collection: 'applications',
      id: application.id,
      data: { stage: 'submitted' },
      overrideAccess: true,
    })
    await decideApplication(payload, {
      applicationId: application.id,
      decision: 'request-changes',
      note: 'Please add one more work.',
      actor: staff,
    })

    const resumed = await getApplication(
      new Request(`${ORIGIN}/next/members/application?type=artist`, { headers: { cookie } }),
    )
    const body = (await resumed.json()) as {
      application: { stage: string; decisionNote: string; staffNotes?: string }
    }
    expect(body.application.stage).toBe('changes-requested')
    expect(body.application.decisionNote).toBe('Please add one more work.')
    expect(body.application).not.toHaveProperty('staffNotes')
    expect((await call(saveStep, cookie, { step: 'about', data: goodSteps.about })).status).toBe(
      200,
    )
  })
})

describe('a partner application', () => {
  const partner = {
    category: 'placement',
    subType: 'Interior designer',
    fullName: 'Ravi Example',
    organisation: 'Example Interiors',
    role: 'Principal',
    phone: '+91 98765 43210',
    city: 'Jammu',
    state: 'Jammu and Kashmir',
    website: 'https://example.com',
    gstin: '27AAPFU0939F1ZV',
    interest: 'Placing original work in residential projects.',
    message: 'We design homes in Jammu and would like to source art locally.',
  }

  it('is sent in one go, with its category, after a real pause', async () => {
    const { cookie, application, member } = await applicant('partner')
    const rushed = await call(savePartner, cookie, { data: partner, formToken: createFormToken() })
    expect(rushed.status).toBe(400)

    const wrong = await call(savePartner, cookie, {
      data: { ...partner, gstin: '27AAPFU0939F1ZW' },
      formToken: createFormToken(Date.now() - 30_000),
    })
    expect(wrong.status).toBe(422)
    expect(((await wrong.json()) as { errors: Record<string, string> }).errors.gstin).toMatch(
      /GSTIN/,
    )

    const sent = await call(savePartner, cookie, {
      data: partner,
      formToken: createFormToken(Date.now() - 30_000),
    })
    expect(sent.status).toBe(200)
    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
    })
    expect(stored).toMatchObject({ stage: 'submitted', partnerCategory: 'placement' })
    expect(stored.partner?.phone).toBe('+919876543210')
    expect(stored.member).toMatchObject({ id: member.id })
  })

  it('refuses a bot that fills the hidden field', async () => {
    const { cookie } = await applicant('partner')
    const response = await call(savePartner, cookie, {
      data: partner,
      formToken: createFormToken(Date.now() - 30_000),
      company_website: 'spam',
    })
    expect(response.status).toBe(400)
  })
})

describe('while applications are closed', () => {
  const setOpen = async (open: boolean) => {
    const slug = process.env.DEFAULT_TENANT_SLUG || 'pjk'
    await payload.update({
      collection: 'site-settings',
      where: { 'tenant.slug': { equals: slug } },
      data: { applicationsOpen: open },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }

  it('refuses to start or send anything, but still lets members sign in', async () => {
    const { cookie } = await applicant('partner')
    await setOpen(false)
    try {
      const token = createFormToken(Date.now() - 10_000)
      const apply = await call(requestCode, '', {
        email: unique('closed'),
        purpose: 'apply-artist',
        formToken: token,
      })
      expect(apply.status).toBe(403)
      expect(((await apply.json()) as { message: string }).message).toMatch(/open soon/)

      const signin = await call(requestCode, '', {
        email: unique('closed'),
        purpose: 'signin',
        formToken: token,
      })
      expect(signin.status).toBe(200)

      const sent = await call(savePartner, cookie, { data: {}, formToken: token })
      expect(sent.status).toBe(403)
      expect((await call(submitArtist, cookie, {})).status).toBe(403)
    } finally {
      await setOpen(true)
    }
  })
})
