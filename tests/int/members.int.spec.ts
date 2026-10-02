import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as requestCode } from '@/app/(frontend)/next/members/request-code/route'
import { GET as sessionInfo } from '@/app/(frontend)/next/members/session/route'
import { POST as signOutEverywhere } from '@/app/(frontend)/next/members/sign-out-everywhere/route'
import { POST as verifyCode } from '@/app/(frontend)/next/members/verify-code/route'
import { ensureApplication } from '@/members/accounts'
import { decideApplication } from '@/members/decide'
import {
  APPLICATION_REFERENCE_PATTERN,
  formatMemberId,
  MEMBER_ID_PATTERN,
  newApplicationReference,
} from '@/members/ids'
import { checkChallenge, issueChallenge } from '@/security/challenges'
import { MEMBER_COOKIE, OTP_MAX_ATTEMPTS } from '@/security/constants'
import { createSession, readSession } from '@/security/memberSession'
import { hashOtp } from '@/security/otp'
import type { User } from '@/payload-types'
import { execute } from '@/utilities/sql'

/*
 * Members end to end: codes, sessions, the sign-in endpoints, member IDs and who can see what.
 * Every address is @example.test and every person is made up; everything created is removed.
 * The route handlers are called directly with real Request objects, the way Next calls them.
 */

let payload: Payload
const DOMAIN = '@example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
let staff: User

const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
// Documentation-range addresses (RFC 5737), unique per test so rate limits never overlap
let ipCounter = 10
const nextIp = () => `198.51.100.${ipCounter++}`

const post = (
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  opts: { ip?: string; cookie?: string; origin?: string | null } = {},
) => {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-forwarded-for': opts.ip ?? nextIp(),
  })
  if (opts.origin !== null) headers.set('origin', opts.origin ?? ORIGIN)
  if (opts.cookie) headers.set('cookie', opts.cookie)
  return handler(
    new Request(`${ORIGIN}/next/members`, { method: 'POST', headers, body: JSON.stringify(body) }),
  )
}

/** Tests cannot read the email, so they set a known code on the challenge instead */
const setCode = async (challengeId: number, code: string) => {
  await execute(
    payload,
    sql`UPDATE login_challenges SET code_hash = ${hashOtp(code, String(challengeId))} WHERE id = ${challengeId}`,
  )
}

const cookieFrom = (response: Response): string => {
  const header = response.headers.get('set-cookie') ?? ''
  return header.split(';')[0]!
}

/** Signs a new applicant in through the real endpoints and returns their cookie */
const applyAndSignIn = async (
  purpose: 'apply-artist' | 'apply-partner',
  email = unique('applicant'),
) => {
  const ip = nextIp()
  const requested = await post(requestCode, { email, purpose }, { ip })
  const { challengeId } = (await requested.json()) as { challengeId: number }
  await setCode(challengeId, '246810')
  const verified = await post(verifyCode, { challengeId, code: '246810' }, { ip })
  expect(verified.status).toBe(200)
  const member = (
    await payload.find({
      collection: 'members',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
  ).docs[0]!
  return { email, cookie: cookieFrom(verified), member, response: verified }
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
  await execute(
    payload,
    sql`DELETE FROM payload_preferences_rels WHERE members_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM login_challenges WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'member-%'`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: 'members-test@pjk.co.in' } },
    overrideAccess: true,
  })
  staff =
    found.docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email: 'members-test@pjk.co.in',
        name: 'Members test',
        roles: ['super-admin'],
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
    where: { email: { equals: 'members-test@pjk.co.in' } },
    overrideAccess: true,
  })
})

describe('member IDs and application references', () => {
  it('are formatted as AT000001 and PT000001', () => {
    expect(formatMemberId('artist', 1)).toBe('AT000001')
    expect(formatMemberId('partner', 42)).toBe('PT000042')
    expect(formatMemberId('artist', 1_234_567)).toBe('AT1234567')
    expect(() => formatMemberId('artist', 0)).toThrow()
    expect(MEMBER_ID_PATTERN.test('AT000001')).toBe(true)
    expect(MEMBER_ID_PATTERN.test('AT00001')).toBe(false)
  })

  it('gives applications random references people can read aloud', () => {
    const refs = new Set(Array.from({ length: 500 }, newApplicationReference))
    expect(refs.size).toBe(500)
    for (const ref of refs) {
      expect(ref).toMatch(APPLICATION_REFERENCE_PATTERN)
      expect(ref.slice(4)).not.toMatch(/[01ILOUV]/)
    }
  })
})

describe('one-time codes', () => {
  const issue = (email = unique('code')) =>
    issueChallenge(payload, {
      email,
      ip: nextIp(),
      audience: 'member',
      purpose: 'signin',
      deliverable: true,
    })

  it('work once, and only once', async () => {
    const { id, code } = await issue()
    expect((await checkChallenge(payload, { challengeId: id, code, audience: 'member' })).ok).toBe(
      true,
    )
    const again = await checkChallenge(payload, { challengeId: id, code, audience: 'member' })
    expect(again).toMatchObject({ ok: false, reason: 'spent' })
  })

  it('stop working after five wrong attempts, even with the right code', async () => {
    const { id, code } = await issue()
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      const wrong = String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0')
      expect(
        (await checkChallenge(payload, { challengeId: id, code: wrong, audience: 'member' })).ok,
      ).toBe(false)
    }
    expect(
      await checkChallenge(payload, { challengeId: id, code, audience: 'member' }),
    ).toMatchObject({
      ok: false,
      reason: 'too-many-attempts',
    })
  })

  it('compare at most five guesses even when a hundred arrive at once', async () => {
    const { id, code } = await issue()
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        checkChallenge(payload, { challengeId: id, code: wrong, audience: 'member' }),
      ),
    )
    expect(results.filter((r) => !r.ok && r.reason === 'wrong-code')).toHaveLength(OTP_MAX_ATTEMPTS)
    const [row] = await execute<{ attempts: string }>(
      payload,
      sql`SELECT attempts FROM login_challenges WHERE id = ${id}`,
    )
    expect(Number(row!.attempts)).toBe(OTP_MAX_ATTEMPTS)
  })

  it('cannot be spent twice by two correct submissions at once', async () => {
    const { id, code } = await issue()
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        checkChallenge(payload, { challengeId: id, code, audience: 'member' }),
      ),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })

  it('expire after ten minutes', async () => {
    const { id, code } = await issue()
    await execute(
      payload,
      sql`UPDATE login_challenges SET expires_at = now() - interval '1 second' WHERE id = ${id}`,
    )
    expect(
      await checkChallenge(payload, { challengeId: id, code, audience: 'member' }),
    ).toMatchObject({ reason: 'expired' })
  })

  it('cannot cross between staff and members', async () => {
    const { id, code } = await issue()
    expect((await checkChallenge(payload, { challengeId: id, code, audience: 'staff' })).ok).toBe(
      false,
    )
  })

  it('are never stored as the code itself', async () => {
    const { id, code } = await issue()
    const [row] = await execute<{ code_hash: string }>(
      payload,
      sql`SELECT code_hash FROM login_challenges WHERE id = ${id}`,
    )
    expect(row!.code_hash).not.toContain(code)
    expect(row!.code_hash).toBe(hashOtp(code, String(id)))
  })
})

describe('asking for a code', () => {
  it('refuses requests from other sites', async () => {
    const response = await post(
      requestCode,
      { email: unique('x'), purpose: 'signin' },
      { origin: 'https://evil.example' },
    )
    expect(response.status).toBe(403)
    expect(
      (await post(requestCode, { email: unique('x'), purpose: 'signin' }, { origin: null })).status,
    ).toBe(403)
  })

  it('answers identically whether or not the address belongs to a member', async () => {
    const { email: known } = await applyAndSignIn('apply-artist')
    const a = await post(requestCode, { email: known, purpose: 'signin' })
    const b = await post(requestCode, { email: unique('stranger'), purpose: 'signin' })
    expect(a.status).toBe(b.status)
    const [bodyA, bodyB] = (await Promise.all([a.json(), b.json()])) as {
      message: string
      challengeId: number
    }[]
    expect(bodyA.message).toBe(bodyB.message)
    expect(Object.keys(bodyA).sort()).toEqual(Object.keys(bodyB).sort())
    expect(bodyA.message).toBe('If that address is registered, a code is on its way.')
  })

  it('never lets a code for a stranger sign anyone in', async () => {
    const email = unique('stranger')
    const ip = nextIp()
    const { challengeId } = (await (
      await post(requestCode, { email, purpose: 'signin' }, { ip })
    ).json()) as { challengeId: number }
    await setCode(challengeId, '135791')
    expect((await post(verifyCode, { challengeId, code: '135791' }, { ip })).status).toBe(401)
  })

  it('is limited per address', async () => {
    const email = unique('flood')
    const statuses: number[] = []
    for (let i = 0; i < 6; i++)
      statuses.push((await post(requestCode, { email, purpose: 'apply-artist' })).status)
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true)
    expect(statuses[5]).toBe(429)
  })

  it('tells a bot it worked and does nothing', async () => {
    const email = unique('bot')
    const response = await post(requestCode, {
      email,
      purpose: 'apply-artist',
      company_website: 'http://spam.example',
    })
    expect(response.status).toBe(200)
    const count = await payload.count({
      collection: 'login-challenges',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
    expect(count.totalDocs).toBe(0)
  })
})

describe('signing in', () => {
  it('creates an applicant with a draft application on their first code', async () => {
    const { member, response } = await applyAndSignIn('apply-artist')
    expect(member).toMatchObject({ standing: 'active' })
    expect(member.artistId ?? null).toBeNull()
    expect(member.partnerId ?? null).toBeNull()
    const application = (
      await payload.find({
        collection: 'applications',
        where: { member: { equals: member.id } },
        overrideAccess: true,
      })
    ).docs[0]!
    expect(application.stage).toBe('draft')
    expect(application.reference).toMatch(APPLICATION_REFERENCE_PATTERN)

    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toMatch(new RegExp(`^${MEMBER_COOKIE}=`))
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
    expect(cookie).toMatch(/Path=\//)
  })

  it('locks an address after ten wrong codes, even against the right one', async () => {
    const { email } = await applyAndSignIn('apply-partner')
    for (let round = 0; round < 3; round++) {
      const { challengeId } = (await (
        await post(requestCode, { email, purpose: 'signin' })
      ).json()) as { challengeId: number }
      for (let i = 0; i < 4; i++) await post(verifyCode, { challengeId, code: '000000' })
      if (round === 2) {
        await setCode(challengeId, '999999')
        // A fresh challenge: the right code, refused because the address is locked
        const { challengeId: fresh } = (await (
          await post(requestCode, { email, purpose: 'signin' })
        ).json()) as { challengeId: number }
        await setCode(fresh, '999999')
        expect((await post(verifyCode, { challengeId: fresh, code: '999999' })).status).toBe(401)
      }
    }
    const locked = await payload.count({
      collection: 'security-events',
      where: { and: [{ email: { equals: email } }, { event: { equals: 'member-locked' } }] },
      overrideAccess: true,
    })
    expect(locked.totalDocs).toBe(1)
  })

  it('ends the session the browser held before (rotation)', async () => {
    const { email, cookie: first } = await applyAndSignIn('apply-artist')
    const ip = nextIp()
    const { challengeId } = (await (
      await post(requestCode, { email, purpose: 'signin' }, { ip })
    ).json()) as { challengeId: number }
    await setCode(challengeId, '112233')
    const second = await post(verifyCode, { challengeId, code: '112233' }, { ip, cookie: first })
    expect(second.status).toBe(200)
    expect(await readSession(payload, decodeURIComponent(first.split('=')[1]!))).toBeNull()
    expect(
      await readSession(payload, decodeURIComponent(cookieFrom(second).split('=')[1]!)),
    ).not.toBeNull()
  })

  it('signs out everywhere at once', async () => {
    const { member, cookie } = await applyAndSignIn('apply-artist')
    const other = await createSession(payload, {
      memberId: member.id,
      userAgent: 'Firefox/140 Windows',
    })
    const response = await post(signOutEverywhere, {}, { cookie })
    expect(response.status).toBe(200)
    expect(((await response.json()) as { ended: number }).ended).toBe(2)
    expect(await readSession(payload, other.value)).toBeNull()

    const after = await sessionInfo(
      new Request(`${ORIGIN}/next/members/session`, { headers: { cookie } }),
    )
    expect(((await after.json()) as { signedIn: boolean }).signedIn).toBe(false)
  })

  it('refuses a suspended member, and suspending ends their sessions', async () => {
    const { email, member, cookie } = await applyAndSignIn('apply-artist')
    await payload.update({
      collection: 'members',
      id: member.id,
      data: { standing: 'suspended' },
      overrideAccess: true,
    })
    expect(await readSession(payload, decodeURIComponent(cookie.split('=')[1]!))).toBeNull()

    const { challengeId } = (await (
      await post(requestCode, { email, purpose: 'signin' })
    ).json()) as { challengeId: number }
    await setCode(challengeId, '445566')
    expect((await post(verifyCode, { challengeId, code: '445566' })).status).toBe(401)
  })
})

describe('sessions', () => {
  it('refuse a tampered or forged cookie', async () => {
    const { member } = await applyAndSignIn('apply-artist')
    const { value } = await createSession(payload, { memberId: member.id })
    const [sid, secret, signature] = value.split('.')
    expect(await readSession(payload, value)).not.toBeNull()
    expect(await readSession(payload, `${sid}.${secret}.${signature!.slice(0, -2)}AA`)).toBeNull()
    expect(await readSession(payload, `${sid}.${'A'.repeat(43)}.${signature}`)).toBeNull()
    expect(await readSession(payload, 'nonsense')).toBeNull()
  })

  it('slide forward with use, but never past thirty days', async () => {
    const { member } = await applyAndSignIn('apply-artist')
    const { value, sid } = await createSession(payload, { memberId: member.id })
    await execute(
      payload,
      sql`UPDATE member_sessions SET last_seen_at = now() - interval '2 days', expires_at = now() + interval '5 days' WHERE sid = ${sid}`,
    )
    const slid = await readSession(payload, value)
    expect(slid?.refreshCookie).toMatch(/Max-Age=6\d{5}/) // about seven days, in seconds
    expect(new Date(slid!.session.expiresAt).getTime()).toBeLessThan(
      Date.now() + 7 * 86_400_000 + 1000,
    )

    await execute(
      payload,
      sql`UPDATE member_sessions SET absolute_expires_at = now() - interval '1 second' WHERE sid = ${sid}`,
    )
    expect(await readSession(payload, value)).toBeNull()
  })

  it('end when idle for a week', async () => {
    const { member } = await applyAndSignIn('apply-artist')
    const { value, sid } = await createSession(payload, { memberId: member.id })
    await execute(
      payload,
      sql`UPDATE member_sessions SET expires_at = now() - interval '1 second' WHERE sid = ${sid}`,
    )
    expect(await readSession(payload, value)).toBeNull()
  })

  it('store only a hash of the secret', async () => {
    const { member } = await applyAndSignIn('apply-artist')
    const { value, sid } = await createSession(payload, { memberId: member.id })
    const secret = value.split('.')[1]!
    const [row] = await execute<Record<string, unknown>>(
      payload,
      sql`SELECT * FROM member_sessions WHERE sid = ${sid}`,
    )
    expect(JSON.stringify(row)).not.toContain(secret)
  })
})

describe('approval and member IDs', () => {
  const submitted = async (type: 'artist' | 'partner', email?: string) => {
    const { member, application } = await ensureApplication(payload, {
      email: email ?? unique(type),
      type,
    })
    await payload.update({
      collection: 'applications',
      id: application.id,
      data: { stage: 'submitted' },
      overrideAccess: true,
    })
    return { member, application }
  }

  it('issues an ID only on approval, from the right sequence', async () => {
    const artist = await submitted('artist')
    const partner = await submitted('partner')
    expect(artist.member.artistId ?? null).toBeNull()

    const a = await decideApplication(payload, {
      applicationId: artist.application.id,
      decision: 'approve',
      actor: staff,
    })
    const p = await decideApplication(payload, {
      applicationId: partner.application.id,
      decision: 'approve',
      actor: staff,
    })
    expect(a.member.artistId).toMatch(/^AT\d{6}$/)
    expect(a.member.partnerId ?? null).toBeNull()
    expect(p.member.partnerId).toMatch(/^PT\d{6}$/)
    expect(p.member.artistId ?? null).toBeNull()
    expect(a.application.stage).toBe('approved')
    expect(a.application.issuedId).toBe(a.member.artistId)
  })

  it('gives every approval its own number when many happen at once', async () => {
    const applicants = await Promise.all(Array.from({ length: 12 }, () => submitted('artist')))
    const results = await Promise.all(
      applicants.map(({ application }) =>
        decideApplication(payload, {
          applicationId: application.id,
          decision: 'approve',
          actor: staff,
        }),
      ),
    )
    const ids = results.map((r) => r.member.artistId!)
    expect(new Set(ids).size).toBe(12)
    const numbers = ids.map((id) => Number(id.slice(2))).sort((x, y) => x - y)
    // Gap-tolerant, but these twelve were taken back to back
    expect(numbers[11]! - numbers[0]!).toBe(11)
  })

  it('does not spend a number on a rejection', async () => {
    const before = await execute<{ last_value: string }>(
      payload,
      sql`SELECT last_value FROM member_id_artist_seq`,
    )
    const { application, member } = await submitted('artist')
    await decideApplication(payload, {
      applicationId: application.id,
      decision: 'reject',
      note: 'Not this time.',
      actor: staff,
    })
    const after = await execute<{ last_value: string }>(
      payload,
      sql`SELECT last_value FROM member_id_artist_seq`,
    )
    expect(after[0]!.last_value).toBe(before[0]!.last_value)
    const reloaded = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(reloaded.artistId ?? null).toBeNull()
  })

  it('never lets a member ID change once issued', async () => {
    const { application } = await submitted('artist')
    const { member } = await decideApplication(payload, {
      applicationId: application.id,
      decision: 'approve',
      actor: staff,
    })
    await expect(
      payload.update({
        collection: 'members',
        id: member.id,
        data: { artistId: 'AT999999' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/cannot be set or changed/)
    // Nor can the empty slot be filled by hand, even by the server outside an approval
    await expect(
      payload.update({
        collection: 'members',
        id: member.id,
        data: { partnerId: 'PT000777' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/cannot be set or changed/)
    await expect(
      payload.create({
        collection: 'members',
        data: { email: unique('forged'), standing: 'active', artistId: 'AT000777' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('needs a note to reject or ask for changes, and follows the stages', async () => {
    const { application } = await submitted('partner')
    await expect(
      decideApplication(payload, {
        applicationId: application.id,
        decision: 'reject',
        actor: staff,
      }),
    ).rejects.toThrow(/note/)
    await decideApplication(payload, {
      applicationId: application.id,
      decision: 'request-changes',
      note: 'Add a portfolio link.',
      actor: staff,
    })
    await expect(
      decideApplication(payload, {
        applicationId: application.id,
        decision: 'approve',
        actor: staff,
      }),
    ).rejects.toThrow()
  })

  it('lets one person be both an artist and a partner, under one sign-in', async () => {
    const email = unique('both')
    const artist = await submitted('artist', email)
    const { member: asArtist } = await decideApplication(payload, {
      applicationId: artist.application.id,
      decision: 'approve',
      actor: staff,
    })

    // The same person applies as a partner through the real endpoints, signed in as themselves
    const ip = nextIp()
    const requested = await post(requestCode, { email, purpose: 'apply-partner' }, { ip })
    const { challengeId } = (await requested.json()) as { challengeId: number }
    await setCode(challengeId, '808080')
    expect((await post(verifyCode, { challengeId, code: '808080' }, { ip })).status).toBe(200)

    const members = await payload.find({
      collection: 'members',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
    expect(members.totalDocs).toBe(1)
    const applications = await payload.find({
      collection: 'applications',
      where: { member: { equals: asArtist.id } },
      overrideAccess: true,
      depth: 0,
    })
    expect(applications.docs.map((a) => a.type).sort()).toEqual(['artist', 'partner'])

    const partnerApp = applications.docs.find((a) => a.type === 'partner')!
    await payload.update({
      collection: 'applications',
      id: partnerApp.id,
      data: { stage: 'submitted' },
      overrideAccess: true,
    })
    const { member: both } = await decideApplication(payload, {
      applicationId: partnerApp.id,
      decision: 'approve',
      actor: staff,
    })
    expect(both.id).toBe(asArtist.id)
    expect(both.artistId).toBe(asArtist.artistId)
    expect(both.partnerId).toMatch(/^PT\d{6}$/)

    // A second artist application for the same person is the same application, not a new one
    const again = await ensureApplication(payload, { email, type: 'artist' })
    expect(again.createdApplication).toBe(false)
    await expect(
      payload.create({
        collection: 'applications',
        data: {
          reference: newApplicationReference(),
          member: both.id,
          type: 'partner',
          stage: 'draft',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('records the decision with the member of staff who took it', async () => {
    const { application, member } = await submitted('artist')
    const { member: approved } = await decideApplication(payload, {
      applicationId: application.id,
      decision: 'approve',
      actor: staff,
    })
    const events = await payload.find({
      collection: 'security-events',
      where: { email: { equals: member.email } },
      overrideAccess: true,
      depth: 0,
    })
    const approvedEvent = events.docs.find((e) => e.event === 'application-approved')!
    expect(approvedEvent.actor).toBe(staff.id)
    expect(approvedEvent.subject).toBe(approved.artistId)
    expect(
      events.docs.some((e) => e.event === 'member-id-issued' && e.subject === approved.artistId),
    ).toBe(true)
  })
})

describe('what one member can see of another', () => {
  let a: Awaited<ReturnType<typeof applyAndSignIn>>
  let b: Awaited<ReturnType<typeof applyAndSignIn>>
  const asMember = (member: { id: number }) => ({
    user: { ...member, collection: 'members' } as never,
    overrideAccess: false,
  })

  beforeAll(async () => {
    a = await applyAndSignIn('apply-artist')
    b = await applyAndSignIn('apply-artist')
  })

  it('through the Local API: only their own record and application', async () => {
    const members = await payload.find({ collection: 'members', ...asMember(a.member) })
    expect(members.docs.map((m) => m.id)).toEqual([a.member.id])
    await expect(
      payload.findByID({ collection: 'members', id: b.member.id, ...asMember(a.member) }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'members',
        id: b.member.id,
        data: { displayName: 'Not mine' },
        ...asMember(a.member),
      }),
    ).rejects.toThrow()

    const applications = await payload.find({
      collection: 'applications',
      depth: 0,
      ...asMember(a.member),
    })
    expect(applications.docs).toHaveLength(1)
    expect(applications.docs[0]!.member).toBe(a.member.id)
    const theirs = (
      await payload.find({
        collection: 'applications',
        where: { member: { equals: b.member.id } },
        overrideAccess: true,
      })
    ).docs[0]!
    await expect(
      payload.findByID({ collection: 'applications', id: theirs.id, ...asMember(a.member) }),
    ).rejects.toThrow()
  })

  it('cannot promote themselves, issue an ID, or move their own application', async () => {
    const updated = await payload.update({
      collection: 'members',
      id: a.member.id,
      data: { displayName: 'Asha', standing: 'suspended', partnerCategory: 'partnership' } as never,
      ...asMember(a.member),
    })
    expect(updated.displayName).toBe('Asha')
    expect(updated.standing).toBe('active')
    expect(updated.partnerCategory ?? null).toBeNull()
    // Payload drops fields a user may not write rather than refusing the request
    const selfIssued = await payload.update({
      collection: 'members',
      id: a.member.id,
      data: { artistId: 'AT000001' } as never,
      ...asMember(a.member),
    })
    expect(selfIssued.artistId ?? null).toBeNull()

    const own = (
      await payload.find({
        collection: 'applications',
        where: { member: { equals: a.member.id } },
        overrideAccess: true,
      })
    ).docs[0]!
    const moved = await payload.update({
      collection: 'applications',
      id: own.id,
      data: { stage: 'approved' } as never,
      ...asMember(a.member),
    })
    expect(moved.stage).toBe('draft')
  })

  it('never sees staff notes', async () => {
    const own = (
      await payload.find({
        collection: 'applications',
        where: { member: { equals: a.member.id } },
        overrideAccess: true,
      })
    ).docs[0]!
    await payload.update({
      collection: 'applications',
      id: own.id,
      data: { staffNotes: 'Internal only' },
      overrideAccess: true,
    })
    const seen = await payload.findByID({
      collection: 'applications',
      id: own.id,
      ...asMember(a.member),
    })
    expect(JSON.stringify(seen)).not.toContain('Internal only')
  })

  it('through REST, with a real session cookie', async () => {
    const { REST_GET, REST_PATCH, REST_POST } = await import('@payloadcms/next/routes')
    const get = REST_GET(config)
    const call = (path: string[], cookie: string) =>
      get(new Request(`${ORIGIN}/api/${path.join('/')}`, { headers: { cookie } }), {
        params: Promise.resolve({ slug: path }),
      })

    const own = await call(['members', String(a.member.id)], a.cookie)
    expect(own.status).toBe(200)
    expect(((await own.json()) as { email: string }).email).toBe(a.email)

    expect([403, 404]).toContain((await call(['members', String(b.member.id)], a.cookie)).status)

    const list = (await (await call(['members'], a.cookie)).json()) as { docs: { id: number }[] }
    expect(list.docs.map((d) => d.id)).toEqual([a.member.id])

    const apps = (await (await call(['applications'], a.cookie)).json()) as {
      docs: { member: unknown }[]
    }
    expect(apps.docs).toHaveLength(1)

    for (const collection of [
      'users',
      'security-events',
      'member-sessions',
      'login-challenges',
      'form-submissions',
      'tenants',
    ]) {
      expect([401, 403]).toContain((await call([collection], a.cookie)).status)
    }

    const patch = REST_PATCH(config)
    const tamper = await patch(
      new Request(`${ORIGIN}/api/members/${b.member.id}`, {
        method: 'PATCH',
        headers: { cookie: a.cookie, 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ displayName: 'Hijacked' }),
      }),
      { params: Promise.resolve({ slug: ['members', String(b.member.id)] }) },
    )
    expect([403, 404]).toContain(tamper.status)
    const still = await payload.findByID({
      collection: 'members',
      id: b.member.id,
      overrideAccess: true,
    })
    expect(still.displayName ?? null).not.toBe('Hijacked')

    // A member cannot take staff decisions either
    const post = REST_POST(config)
    const ownApp = (
      await payload.find({
        collection: 'applications',
        where: { member: { equals: a.member.id } },
        overrideAccess: true,
      })
    ).docs[0]!
    const decided = await post(
      new Request(`${ORIGIN}/api/applications/${ownApp.id}/decide`, {
        method: 'POST',
        headers: { cookie: a.cookie, 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params: Promise.resolve({ slug: ['applications', String(ownApp.id), 'decide'] }) },
    )
    expect(decided.status).toBe(403)
  })

  it('has no GraphQL to try instead', async () => {
    expect(payload.config.graphQL.disable).toBe(true)
    const { REST_POST } = await import('@payloadcms/next/routes')
    const response = await REST_POST(config)(
      new Request(`${ORIGIN}/api/graphql`, {
        method: 'POST',
        headers: { cookie: a.cookie, 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ query: '{ Members { docs { email } } }' }),
      }),
      { params: Promise.resolve({ slug: ['graphql'] }) },
    )
    expect(response.status).toBe(404)
  })
})
