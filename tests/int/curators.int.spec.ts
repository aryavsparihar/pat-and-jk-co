// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as start } from '@/app/(frontend)/next/curators/route'
import { POST as finish } from '@/app/(frontend)/next/curators/finish/route'
import { POST as sendPart } from '@/app/(frontend)/next/curators/part/route'
import { addCuratorNote, sendFromCuratorsScreen, setCuratorProject } from '@/curators/admin'
import { checkCurator } from '@/curators/check'
import { curatorEmailDraft } from '@/curators/drafts'
import { CURATOR_NOTICE_VERSION } from '@/curators/rules'
import { decideApplication } from '@/members/decide'
import { createFormToken } from '@/members/formToken'
import type { User } from '@/payload-types'
import { execute } from '@/utilities/sql'

/*
 * The guest curator form (the founder's ApplyCurator, AdminCurators and CuratorEmails designs, and
 * his brief of 25 November 2026): no account, a CA- number, the portfolio as a link or a PDF of up
 * to 20 MB and a CV of up to 5 MB sent in parts, one open application per address, and the team's
 * two letters, which move the status on. Every address is made up at @curator.example.test.
 */

let payload: Payload
let staff: User
let ip = 1
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const DOMAIN = '@curator.example.test'
const STAFF_EMAIL = 'curators-test@pjk.co.in'
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`

/** A small PDF and a small Word file: their first bytes are what the server checks */
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2048, 32)])
const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(1024, 0)])

const answers = (email: string) => ({
  fullName: 'Rohan Example',
  email,
  phone: '+91 98765 43210',
  country: 'India',
  city: 'Delhi',
  role: 'Independent curator',
  years: '6-10',
  areas: ['contemporary', 'interiors-hospitality'],
  languages: 'English, Hindi',
  portfolioLink: '',
  projects: [
    { title: 'Paper and Thread', year: '2024', place: 'A gallery in Delhi', role: 'Lead curator' },
    { title: 'Rooms of Light', year: 2023, place: 'A hotel group', role: 'Selection', link: '' },
  ],
  wants: 'both',
  idea: 'Works on paper from Jammu.',
  fee: 'By project',
  start: 'From January',
})

const body = (email: string, extra: Record<string, unknown> = {}) => ({
  data: answers(email),
  consent: true,
  adult: true,
  accurate: true,
  keepOnFile: false,
  files: {
    portfolio: { name: 'portfolio.pdf', size: pdf.length },
    cv: { name: 'cv.docx', size: docx.length },
  },
  formToken: createFormToken(Date.now() - 30_000),
  ...extra,
})

const json = (handler: (r: Request) => Promise<Response>, payloadBody: unknown, path = 'x') =>
  handler(
    new Request(`${ORIGIN}/next/curators/${path}`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${ip++}`,
        'user-agent': 'Curator test browser',
      },
      body: JSON.stringify(payloadBody),
    }),
  )

const part = (id: number, token: string, file: number, n: number, bytes: Buffer) =>
  sendPart(
    new Request(`${ORIGIN}/next/curators/part?id=${id}&file=${file}&part=${n}`, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'application/octet-stream',
        'x-upload-token': token,
      },
      body: new Uint8Array(bytes),
    }),
  )

/** The whole journey a page makes: the answers, each file in one part, then the finish */
const apply = async (email: string, extra: Record<string, unknown> = {}) => {
  const started = await json(start, body(email, extra))
  const s = (await started.json()) as { id: number; token: string; message?: string }
  if (started.status !== 200) return { status: started.status, ...s }
  expect((await part(s.id, s.token, 0, 0, pdf)).status).toBe(200)
  expect((await part(s.id, s.token, 1, 0, docx)).status).toBe(200)
  const done = await json(finish, { id: s.id, token: s.token }, 'finish')
  return { status: done.status, id: s.id, ...((await done.json()) as { reference?: string }) }
}

const stored = (id: number) =>
  payload.findByID({ collection: 'applications', id, overrideAccess: true, showHiddenFields: true })

const cleanup = async () => {
  await execute(
    payload,
    sql`DELETE FROM applications WHERE type = 'curator' AND curator_email LIKE ${`%${DOMAIN}`}`,
  )
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE ${`%${DOMAIN}`}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  staff =
    (
      await payload.find({
        collection: 'users',
        where: { email: { equals: STAFF_EMAIL } },
        overrideAccess: true,
      })
    ).docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email: STAFF_EMAIL,
        name: 'Curators test',
        roles: ['editor'] as never,
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      },
      overrideAccess: true,
    }))
})

afterAll(async () => {
  await cleanup()
  await payload.delete({
    collection: 'users',
    where: { email: { equals: STAFF_EMAIL } },
    overrideAccess: true,
  })
})

describe('the curator form, checked', () => {
  it('lists every problem at once, in the founder’s words', () => {
    const checked = checkCurator({ data: { projects: [{}] }, files: {} })
    expect(checked.ok).toBe(false)
    if (checked.ok) return
    expect(checked.errors).toMatchObject({
      fullName: 'Please give your full name.',
      email: 'Please enter a full email address, for example name@example.com.',
      city: 'Please add your city.',
      role: 'Please tell us your current role.',
      years: 'Please choose how many years you have been curating.',
      areas: 'Please choose at least one area.',
      projects: 'Please tell us about at least two past projects.',
      'projects.0.title': 'Please give the project a title.',
      'projects.0.year': 'Please give the year.',
      'projects.0.place': 'Please say where it was, or for whom.',
      'projects.0.role': 'Please tell us what your own part was.',
      wants: 'Please choose what you would like to work on.',
      portfolioLink: 'Please add a link to your portfolio, or upload it as a PDF.',
      cv: 'Please add your CV.',
      consent: 'Please tick the box to agree to how we will use your details.',
      adult: 'Please confirm that you are 18 or over.',
      accurate: 'Please confirm that your portfolio and projects are described accurately.',
    })
  })

  it('takes a portfolio as a link or a PDF, and holds each file to its kind and size', () => {
    const email = unique('check')
    const errorsFor = (extra: Record<string, unknown>) => {
      const checked = checkCurator(body(email, extra))
      return checked.ok ? {} : checked.errors
    }
    expect(errorsFor({})).toEqual({})
    // A link instead of the PDF
    expect(
      errorsFor({
        data: { ...answers(email), portfolioLink: 'https://example.com/work' },
        files: { cv: { name: 'cv.pdf', size: 1000 } },
      }),
    ).toEqual({})
    expect(
      errorsFor({
        files: {
          portfolio: { name: 'p.pdf', size: 21 * 1024 * 1024 },
          cv: { name: 'cv.pdf', size: 10 },
        },
      }).portfolioFile,
    ).toBe('Your portfolio is larger than 20 MB. Please send a smaller copy, or a link instead.')
    expect(errorsFor({ files: { cv: { name: 'cv.txt', size: 10 } } }).cv).toBe(
      'Your CV needs to be a PDF or Word file.',
    )
    expect(errorsFor({ files: { cv: { name: 'cv.pdf', size: 6 * 1024 * 1024 } } }).cv).toBe(
      'Your CV is larger than 5 MB. Please send a smaller copy.',
    )
  })
})

describe('a guest curator’s application', () => {
  it('arrives with a CA- number, its files sealed, and the consent kept', async () => {
    const email = unique('arrives')
    const result = await apply(email)
    expect(result.status).toBe(200)
    expect(result.reference).toMatch(/^CA-[2-9A-HJKMNP-TW-Z]{5}$/)

    const application = await stored(result.id!)
    expect(application).toMatchObject({
      type: 'curator',
      stage: 'submitted',
      curatorStatus: 'new',
      member: null,
      curator: { fullName: 'Rohan Example', email, phone: '+919876543210', years: '6-10' },
      curatorDeclarations: {
        consentProcessing: true,
        adult: true,
        accurate: true,
        keepOnFile: false,
        privacyNoticeVersion: CURATOR_NOTICE_VERSION,
      },
    })
    expect(application.curator?.projects).toHaveLength(2)
    expect(application.curatorFiles?.map((f) => [f.kind, f.contentType])).toEqual([
      ['portfolio', 'application/pdf'],
      ['cv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ])
    // The upload token and folder are gone once it has arrived
    expect(application.curatorUpload?.tokenHash ?? null).toBeNull()
    const [consent] = application.consentRecord ?? []
    expect(consent).toMatchObject({ consentChecked: true, policyVersion: CURATOR_NOTICE_VERSION })
    expect(consent!.policyText).toMatch(/To consider you for curatorial projects/)
  })

  it('refuses a file that is not what its name says, at its first part', async () => {
    const started = await json(start, body(unique('wrong')))
    const { id, token } = (await started.json()) as { id: number; token: string }
    const response = await part(id, token, 0, 0, Buffer.from('MZ not a PDF at all'))
    expect(response.status).toBe(415)
    expect(((await response.json()) as { errors: Record<string, string> }).errors).toEqual({
      portfolioFile: 'Your portfolio needs to be a PDF.',
    })
  })

  it('keeps one open application per address, and replaces an unfinished one', async () => {
    const email = unique('once')
    // Started but never finished: sending the form again replaces it
    const first = await json(start, body(email))
    expect(first.status).toBe(200)
    const second = await apply(email)
    expect(second.status).toBe(200)
    const count = await payload.count({
      collection: 'applications',
      where: { 'curator.email': { equals: email } },
      overrideAccess: true,
    })
    expect(count.totalDocs).toBe(1)

    // Sent and still open: refused, in the founder's words
    const again = await json(start, body(email))
    expect(again.status).toBe(409)
    expect(((await again.json()) as { message: string }).message).toBe(
      'We already have an application from this email address, and will reply within seven days.',
    )
  })

  it('is never decided as a member application', async () => {
    const { id } = await apply(unique('decide'))
    await expect(
      decideApplication(payload, {
        applicationId: id!,
        decision: 'approve',
        actor: staff as never,
      }),
    ).rejects.toThrow(/Curators screen/)
  })
})

describe('the Curators screen', () => {
  it('opens each letter as the design words it, with the right second paragraph', () => {
    const talk = curatorEmailDraft('talk', {
      reference: 'CA-7KD2M',
      fullName: 'Rohan Example',
      keepOnFile: false,
    })
    expect(talk.subject).toBe('Your application to curate with PJK')
    expect(talk.body).toMatch(/^Dear Rohan,/)
    expect(talk.body).toMatch(/quoting CA-7KD2M/)
    const kept = curatorEmailDraft('decline', {
      reference: 'CA-7KD2M',
      fullName: 'R',
      keepOnFile: true,
    })
    expect(kept.body).toMatch(/keep your application on file for 12 months/)
    const gone = curatorEmailDraft('decline', {
      reference: 'CA-7KD2M',
      fullName: 'R',
      keepOnFile: false,
    })
    expect(gone.body).toMatch(/We will delete your application within 90 days\.$/)
  })

  it('moves the status on as the letters go, and frees the address after Not this time', async () => {
    const email = unique('letters')
    const { id } = await apply(email, { keepOnFile: true })

    await sendFromCuratorsScreen(payload, staff, {
      id: id!,
      kind: 'talk',
      subject: 'Your application to curate with PJK',
      body: 'Dear Rohan,\n\nWe would like to talk.',
    })
    expect((await stored(id!)).curatorStatus).toBe('talking')

    await setCuratorProject(payload, staff, { id: id!, project: 'First collection' })
    expect(await stored(id!)).toMatchObject({
      curatorStatus: 'working',
      curatorProject: 'First collection',
    })

    await addCuratorNote(payload, staff, { id: id!, note: 'Strong on works on paper.' })
    await sendFromCuratorsScreen(payload, staff, {
      id: id!,
      kind: 'decline',
      subject: 'Your application to curate with PJK',
      body: 'Dear Rohan,\n\nNot this time.',
    })
    const after = await stored(id!)
    // They asked to be kept, so they are On file, not deleted
    expect(after.curatorStatus).toBe('on-file')
    expect(after.currentSlot ?? null).toBeNull()
    expect(after.decidedAt).toBeTruthy()
    expect(after.teamNotes?.[0]).toMatchObject({
      note: 'Strong on works on paper.',
      by: 'Curators test',
    })
    expect(after.curatorEmails?.map((e) => e.kind)).toEqual(['talk', 'decline'])

    // The address may apply again now
    expect((await apply(email)).status).toBe(200)
  })

  it('needs a subject and a message before anything goes', async () => {
    const { id } = await apply(unique('empty'))
    await expect(
      sendFromCuratorsScreen(payload, staff, { id: id!, kind: 'talk', subject: '', body: '' }),
    ).rejects.toThrow(/subject and a message/)
    expect((await stored(id!)).curatorStatus).toBe('new')
  })
})
