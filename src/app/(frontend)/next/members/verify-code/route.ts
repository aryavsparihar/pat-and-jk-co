import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { memberIdsOf } from '@/collections/Members'
import { ensureApplication, findMember } from '@/members/accounts'
import { canChange, canSignIn } from '@/members/standing'
import { applicationsOpenness } from '@/members/openness'
import { fromOurOrigin, readJson, refuseCrossSite, reply } from '@/members/http'
import { challengeEmail, checkChallenge } from '@/security/challenges'
import {
  clientIp,
  MEMBER_FAILURES_BEFORE_LOCK,
  MEMBER_VERIFY_PER_IP_PER_HOUR,
} from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import {
  createSession,
  parseSessionCookie,
  readMemberCookie,
  revokeSession,
  sessionCookieHeader,
} from '@/security/memberSession'
import { hitLimit, peekLimit } from '@/security/rateLimit'
import { sessionHintHeader } from '@/utilities/sessionHint'

export const dynamic = 'force-dynamic'

const rejected = () =>
  reply(
    { message: 'That code is not right, or it has expired. Ask for a new one.' },
    { status: 401 },
  )

const LOCK_WINDOW_SECONDS = 3600

/**
 * Step two for a member: check the code, and sign them in.
 *
 *   - limited per IP, so nobody can work through codes from one place
 *   - an address that has had ten wrong codes in an hour is locked for the rest of that hour:
 *     even the right code is refused, and the lockout goes to the security log
 *   - a verified application code makes sure the person has a draft application of that kind,
 *     creating their member record first if they are new; an existing artist applying as a
 *     partner keeps their one account and gains a second application
 *   - signing in always starts a new session; one the browser already held is ended (rotation)
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)
  const body = await readJson<{ challengeId: number; code: string }>(request)
  if (!body) return rejected()

  const perIp = await hitLimit(payload, {
    scope: 'member-verify-ip',
    subject: ip,
    max: MEMBER_VERIFY_PER_IP_PER_HOUR,
    windowSeconds: 3600,
  })
  if (!perIp.allowed) {
    await logSecurityEvent(payload, { event: 'member-code-rate-limited', ip, detail: 'verify' })
    return reply(
      { message: 'Too many attempts. Try again in an hour.' },
      { status: 429, headers: { 'Retry-After': String(perIp.retryAfter) } },
    )
  }

  const owner = await challengeEmail(payload, { challengeId: body.challengeId, audience: 'member' })
  if (!owner) return rejected()

  const failures = { scope: 'member-code-fail', subject: owner, windowSeconds: LOCK_WINDOW_SECONDS }
  if ((await peekLimit(payload, failures)) >= MEMBER_FAILURES_BEFORE_LOCK) {
    await logSecurityEvent(payload, {
      event: 'member-code-failed',
      email: owner,
      ip,
      detail: 'locked',
    })
    return rejected()
  }

  const result = await checkChallenge(payload, {
    challengeId: body.challengeId,
    code: body.code,
    audience: 'member',
  })

  if (!result.ok) {
    const counted = await hitLimit(payload, { ...failures, max: MEMBER_FAILURES_BEFORE_LOCK })
    await logSecurityEvent(payload, {
      event: 'member-code-failed',
      email: owner,
      ip,
      detail: result.reason,
    })
    if (counted.count === MEMBER_FAILURES_BEFORE_LOCK) {
      await logSecurityEvent(payload, {
        event: 'member-locked',
        email: owner,
        ip,
        detail: `${MEMBER_FAILURES_BEFORE_LOCK} wrong codes in an hour`,
      })
    }
    return rejected()
  }

  const email = result.email
  let member = await findMember(payload, email)

  // Suspended, or deleted (a deleted record no longer holds their address, so this is a second lock)
  if (member && !canSignIn(member.standing)) {
    await logSecurityEvent(payload, { event: 'member-blocked', email, ip, detail: member.standing })
    return rejected()
  }

  // A code issued just before applications closed may still sign someone in, but starts nothing;
  // nor does one for an account on hold, which changes nothing until it is released
  const applying =
    (result.purpose === 'apply-artist' || result.purpose === 'apply-partner') &&
    (!member || canChange(member.standing)) &&
    (await applicationsOpenness(payload)).open

  if (applying && (result.purpose === 'apply-artist' || result.purpose === 'apply-partner')) {
    const ensured = await ensureApplication(payload, {
      email,
      type: result.purpose === 'apply-artist' ? 'artist' : 'partner',
    })
    member = ensured.member
    if (ensured.createdMember || ensured.createdApplication) {
      await logSecurityEvent(payload, {
        event: 'member-created',
        email,
        ip,
        subject: ensured.application.reference,
        detail: `${result.purpose}${ensured.createdMember ? ', new member' : ', existing member'}`,
      })
    }
  }

  if (!member) return rejected()

  if (!canSignIn(member.standing)) {
    await logSecurityEvent(payload, { event: 'member-blocked', email, ip, detail: member.standing })
    return rejected()
  }

  // Rotation: whatever session this browser held before ends now
  const previous = parseSessionCookie(readMemberCookie(request.headers))
  if (previous) await revokeSession(payload, previous.sid, 'replaced at sign-in')

  const session = await createSession(payload, {
    memberId: member.id,
    userAgent: request.headers.get('user-agent'),
  })

  await logSecurityEvent(payload, {
    event: 'member-signed-in',
    email,
    ip,
    subject: memberIdsOf(member),
    detail: result.purpose ?? 'signin',
  })

  return reply(
    { ok: true, artistId: member.artistId ?? null, partnerId: member.partnerId ?? null },
    {
      headers: [
        ['Set-Cookie', sessionCookieHeader(session.value, session.expiresAt)],
        // Tells pages to ask who is signed in (src/utilities/sessionHint.ts)
        ['Set-Cookie', sessionHintHeader('member')],
      ],
    },
  )
}
