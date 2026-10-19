// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as contactRoute } from '@/app/(frontend)/next/members/portal/contact/route'
import { POST as emailConfirmRoute } from '@/app/(frontend)/next/members/portal/email/confirm/route'
import { POST as emailRoute } from '@/app/(frontend)/next/members/portal/email/route'
import { POST as profileRoute } from '@/app/(frontend)/next/members/portal/profile/route'
import { DELETE as endSessionRoute } from '@/app/(frontend)/next/members/portal/sessions/[id]/route'
import { GET as sessionsRoute } from '@/app/(frontend)/next/members/portal/sessions/route'
import { POST as worksFolderRoute } from '@/app/(frontend)/next/members/portal/works-folder/route'
import { DELETE as deletePicture } from '@/app/(frontend)/next/members/portfolio/route'
import { ensureApplication } from '@/members/accounts'
import { ingestPortfolioImage } from '@/members/portfolio'
import type { Member, User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { hashOtp } from '@/security/otp'
import { execute } from '@/utilities/sql'

/*
 * The member portal, through its real route handlers: the works folder in Google Drive, the
 * profile through review to the public, contact details, devices, and changing the email address.
 * The works themselves are only ever in the artist's Drive folder: there is no works collection.
 * Everyone here is made up (@portal.example.test).
 */

let payload: Payload
let staff: User
const DOMAIN = '@portal.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
let ip = 10
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`

type Who = { member: Member; cookie: string; sessionId: number }

/** A member with a session; an approved artist or partner when asked */
const someone = async (kind: 'artist' | 'partner' | 'applicant' = 'artist'): Promise<Who> => {
  const { member } = await ensureApplication(payload, {
    email: unique(kind),
    type: kind === 'partner' ? 'partner' : 'artist',
  })
  const number = String(Math.floor(Math.random() * 1e5)).padStart(5, '0')
  if (kind === 'artist') {
    await execute(
      payload,
      sql`UPDATE members SET artist_id = ${`AT9${number}`} WHERE id = ${member.id}`,
    )
  }
  if (kind === 'partner') {
    await execute(
      payload,
      sql`UPDATE members SET partner_id = ${`PT9${number}`} WHERE id = ${member.id}`,
    )
  }
  const fresh = await payload.findByID({
    collection: 'members',
    id: member.id,
    overrideAccess: true,
  })
  const { value, sid } = await createSession(payload, { memberId: member.id })
  const session = (
    await payload.find({
      collection: 'member-sessions',
      where: { sid: { equals: sid } },
      overrideAccess: true,
    })
  ).docs[0]!
  return {
    member: fresh,
    cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}`,
    sessionId: session.id,
  }
}

const request = (method: string, cookie: string, body?: unknown, path = '/next/members/portal') =>
  new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      cookie,
      origin: ORIGIN,
      'x-forwarded-for': `198.51.100.${ip++ % 250}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const json = async <T>(r: Response) => (await r.json()) as T

const picture = async (member: Member) => {
  const bytes = await sharp({
    create: { width: 900, height: 700, channels: 3, background: { r: 140, g: 100, b: 70 } },
  })
    .jpeg()
    .toBuffer()
  return ingestPortfolioImage(payload, member, bytes)
}

const reviewEndpoint = (path: string) =>
  (payload.collections.members.config.endpoints || []).find((e) => e.path === path)!.handler

const decide = (collection: 'members', id: number, decision: string, note?: string) =>
  reviewEndpoint('/:id/profile-review')({
    user: staff,
    payload,
    routeParams: { id: String(id) },
    json: async () => ({ decision, note }),
  } as never)

/** Whether an approved portrait uses the picture (its `public` mark) */
const isPublicImage = async (id: number) =>
  Boolean(
    (await payload.findByID({ collection: 'portfolio-images', id, overrideAccess: true, depth: 0 }))
      .public,
  )

/** Whether a visitor, signed in as nobody, can read the picture: never, approved or not */
const visitorCanRead = async (id: number) =>
  payload
    .find({
      collection: 'portfolio-images',
      where: { id: { equals: id } },
      overrideAccess: false,
      depth: 0,
    })
    .then(
      (found) => found.docs.length === 1,
      () => false, // refused outright
    )

const cleanup = async () => {
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like}`
  await execute(payload, sql`DELETE FROM portfolio_images WHERE owner_id IN (${members})`)
  await execute(payload, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM login_challenges WHERE email LIKE ${like}`)
  await execute(
    payload,
    sql`DELETE FROM security_events WHERE email LIKE ${like} OR subject LIKE 'AT9%' OR subject LIKE 'PT9%'`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'portal-%'`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  staff =
    (
      await payload.find({
        collection: 'users',
        where: { email: { equals: 'portal-test@pjk.co.in' } },
        overrideAccess: true,
      })
    ).docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email: 'portal-test@pjk.co.in',
        name: 'Portal test',
        roles: ['editor'],
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      } as never,
      overrideAccess: true,
    }))
})

afterAll(async () => {
  await cleanup()
  await payload.delete({
    collection: 'users',
    where: { email: { equals: 'portal-test@pjk.co.in' } },
    overrideAccess: true,
  })
})

describe('who has a portfolio', () => {
  it('only an approved artist: an applicant and a partner are refused', async () => {
    for (const kind of ['applicant', 'partner'] as const) {
      const { cookie } = await someone(kind)
      expect((await profileRoute(request('POST', cookie, { displayName: 'X' }))).status, kind).toBe(
        403,
      )
    }
  })

  it('there is no works collection: works are in the artist’s Google Drive folder', async () => {
    expect(Object.keys(payload.collections)).not.toContain('artworks')
  })
})

describe('the works folder in Google Drive', () => {
  it('takes only a Google Drive folder link, kept in one plain form, from an approved artist', async () => {
    const { member, cookie } = await someone('artist')
    const save = async (url: string, as = cookie) => worksFolderRoute(request('POST', as, { url }))
    const ID = '1AbCdEfGhIjKlMnOpQrStUv'

    for (const pasted of [
      `https://drive.google.com/drive/folders/${ID}?usp=sharing`,
      `https://drive.google.com/drive/u/0/folders/${ID}`,
      `  https://drive.google.com/drive/folders/${ID}  `,
    ]) {
      const saved = await save(pasted)
      expect(saved.status, pasted).toBe(200)
      expect((await json<{ worksFolder: string }>(saved)).worksFolder).toBe(
        `https://drive.google.com/drive/folders/${ID}`,
      )
    }
    for (const wrong of [
      `https://drive.google.com/file/d/${ID}/view`,
      `http://drive.google.com/drive/folders/${ID}`,
      `https://drive.google.com.evil.example/drive/folders/${ID}`,
      `https://evil.example/drive/folders/${ID}`,
      'javascript:alert(1)',
      'not a link',
    ]) {
      expect((await save(wrong)).status, wrong).toBe(422)
    }
    const stored = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(stored.worksFolder).toBe(`https://drive.google.com/drive/folders/${ID}`)

    // An empty one clears it
    expect((await json<{ worksFolder: string | null }>(await save(''))).worksFolder).toBeNull()

    // Only an approved artist has a works folder
    for (const kind of ['applicant', 'partner'] as const) {
      const other = await someone(kind)
      expect(
        (await save(`https://drive.google.com/drive/folders/${ID}`, other.cookie)).status,
        kind,
      ).toBe(403)
    }
    // And members cannot set it through Payload's API: the field is left as it was
    await payload
      .update({
        collection: 'members',
        id: member.id,
        data: { worksFolder: 'https://evil.example' },
        user: { ...member, collection: 'members' } as never,
        overrideAccess: false,
      })
      .catch(() => null)
    const after = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(after.worksFolder ?? null).toBeNull()
  })

  it('pictures staff add in the admin are cleaned as an artist’s are', async () => {
    const { member } = await someone('artist')
    const original = await sharp({
      create: { width: 3200, height: 2400, channels: 3, background: { r: 60, g: 90, b: 120 } },
    })
      .withExif({ IFD0: { Artist: 'Example Person' } })
      .jpeg()
      .toBuffer()
    expect((await sharp(original).metadata()).exif).toBeDefined()
    const added = await payload.create({
      collection: 'portfolio-images',
      data: { owner: member.id },
      file: {
        data: original,
        mimetype: 'image/jpeg',
        name: 'IMG_1234 river.jpg',
        size: original.length,
      },
      user: { ...staff, collection: 'users' } as never,
      overrideAccess: false,
    })
    expect(added.filename).toMatch(/^work-[0-9a-f]{16}\.jpg$/)
    const stored = await readFile(
      path.resolve(process.cwd(), '.uploads/media', String(added.prefix), String(added.filename)),
    )
    const meta = await sharp(stored).metadata()
    expect(meta.exif).toBeUndefined()
    expect(Math.max(meta.width!, meta.height!)).toBe(2400)
  })
})

describe('the profile and contact details', () => {
  it('a profile waits for review; once approved it is public, with its portrait', async () => {
    const { member, cookie } = await someone('artist')
    const portrait = await picture(member)
    const saved = await profileRoute(
      request('POST', cookie, {
        displayName: 'Asha Example',
        bio: 'Paints the foothills.',
        portrait: portrait.id,
        links: [{ label: 'Website', url: 'https://example.com' }],
        mediums: ['painting'],
        exhibitions: [{ title: 'Foothills', venue: 'A town hall', year: 2024 }],
      }),
    )
    expect(saved.status).toBe(200)
    expect(
      (await json<{ profile: { review: { state: string } } }>(saved)).profile.review.state,
    ).toBe('pending')
    expect(await isPublicImage(portrait.id)).toBe(false)

    expect((await decide('members', member.id, 'approve')).status).toBe(200)
    const after = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(after.publicProfile).toMatchObject({
      displayName: 'Asha Example',
      portrait: portrait.id,
    })
    expect(await isPublicImage(portrait.id)).toBe(true)
    // Approved, and still private: the public get copies made when a profile is published
    expect(await visitorCanRead(portrait.id)).toBe(false)

    // A portrait in use cannot be deleted from under the profile
    const del = await deletePicture(
      new Request(`${ORIGIN}/next/members/portfolio?id=${portrait.id}`, {
        method: 'DELETE',
        headers: { cookie, origin: ORIGIN },
      }),
    )
    expect(del.status).toBe(409)
  })

  it('contact details change at once, for artists and partners, not applicants', async () => {
    const artist = await someone('artist')
    const partner = await someone('partner')
    const applicant = await someone('applicant')
    const body = { phone: '+91 98765 43210', contactAddress: { line1: 'House 1', city: 'Kathua' } }
    expect((await contactRoute(request('POST', artist.cookie, body))).status).toBe(200)
    expect((await contactRoute(request('POST', partner.cookie, body))).status).toBe(200)
    expect((await contactRoute(request('POST', applicant.cookie, body))).status).toBe(403)
    const saved = await payload.findByID({
      collection: 'members',
      id: partner.member.id,
      overrideAccess: true,
    })
    expect(saved.phone).toBe('+91 98765 43210')
    expect(saved.contactAddress?.city).toBe('Kathua')
  })
})

describe('devices and the email address', () => {
  it('lists the member’s devices, and signs out one of theirs but nobody else’s', async () => {
    const { member, cookie } = await someone('artist')
    const second = await createSession(payload, { memberId: member.id })
    const listed = await json<{ sessions: { id: number; current: boolean }[] }>(
      await sessionsRoute(request('GET', cookie)),
    )
    expect(listed.sessions).toHaveLength(2)
    expect(listed.sessions.filter((s) => s.current)).toHaveLength(1)
    const other = listed.sessions.find((s) => !s.current)!

    const stranger = await someone('artist')
    expect(
      (await endSessionRoute(request('DELETE', stranger.cookie), params(other.id))).status,
    ).toBe(404)
    expect((await endSessionRoute(request('DELETE', cookie), params(other.id))).status).toBe(200)
    const ended = await payload.find({
      collection: 'member-sessions',
      where: { sid: { equals: second.sid } },
      overrideAccess: true,
    })
    expect(ended.docs[0]?.revokedAt).toBeTruthy()
  })

  it('changes the email only with the code sent to the new address, and signs other devices out', async () => {
    const { member, cookie, sessionId } = await someone('artist')
    const other = await createSession(payload, { memberId: member.id })
    const next = unique('moved')

    const asked = await emailRoute(request('POST', cookie, { email: next }))
    expect(asked.status).toBe(200)
    const { challengeId } = await json<{ challengeId: number }>(asked)

    // The wrong code, or a code for another change, does nothing
    expect(
      (await emailConfirmRoute(request('POST', cookie, { challengeId, code: '000000' }))).status,
    ).toBe(401)
    expect(
      (
        await emailConfirmRoute(
          request('POST', cookie, { challengeId: challengeId + 999, code: '111111' }),
        )
      ).status,
    ).toBe(409)

    await execute(
      payload,
      sql`UPDATE login_challenges SET code_hash = ${hashOtp('246810', String(challengeId))} WHERE id = ${challengeId}`,
    )
    const confirmed = await emailConfirmRoute(
      request('POST', cookie, { challengeId, code: '246810' }),
    )
    expect(confirmed.status).toBe(200)
    const after = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(after.email).toBe(next)

    const sessions = await payload.find({
      collection: 'member-sessions',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
    expect(sessions.docs.find((s) => s.id === sessionId)?.revokedAt ?? null).toBeNull()
    expect(sessions.docs.find((s) => s.sid === other.sid)?.revokedAt).toBeTruthy()
  })
})
