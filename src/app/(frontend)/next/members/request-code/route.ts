import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { memberIdsOf } from '@/collections/Members'
import { findMember } from '@/members/accounts'
import { canSignIn } from '@/members/standing'
import { checkFormToken } from '@/members/formToken'
import { applicationsOpenness, closedReply } from '@/members/openness'
import { sendMemberCode } from '@/members/emails'
import { filledHoneypot, fromOurOrigin, readJson, refuseCrossSite, reply } from '@/members/http'
import { issueChallenge, type Purpose } from '@/security/challenges'
import {
  clientIp,
  isEmail,
  MEMBER_CODES_PER_EMAIL_PER_HOUR,
  MEMBER_CODES_PER_IP_PER_HOUR,
  normaliseEmail,
} from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { hitLimits } from '@/security/rateLimit'
import {
  TURNSTILE_FIELD,
  TURNSTILE_REFUSED,
  type TurnstileAction,
  requestHostname,
  verifyTurnstile,
} from '@/security/turnstile'

export const dynamic = 'force-dynamic'

const PURPOSES = ['signin', 'apply-artist', 'apply-partner'] satisfies (Purpose & TurnstileAction)[]

const SIGN_IN_REPLY = 'A code is on its way to that address.'
const APPLY_REPLY = 'A code is on its way to that address.'
/** Signing in with an address nobody has applied with: the form links to /collaborate */
const NOT_REGISTERED = 'That email address is not registered with us.'
const SUSPENDED =
  'This account is suspended, so it cannot sign in. Please write to hello@pjk.co.in.'

/**
 * Step one for a member: email a one-time code.
 *
 *   purpose "signin"         only an existing, unsuspended member is sent a code; an address
 *                            nobody has applied with is told it is not registered, and pointed to
 *                            /collaborate to apply. This says which addresses are registered, by
 *                            choice: it is behind the bot check and the per-address and per-IP
 *                            limits above it, so it cannot be asked at any speed
 *   purpose "apply-…"        anyone may be sent a code (that is how an application begins), so
 *                            the reply is the same for a new address and a known one
 *
 * Limited per address and per IP in Postgres. Every request goes to the security log.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)
  const body = await readJson<{ email: string; purpose: Purpose }>(request)
  const email = normaliseEmail(body?.email)
  const purpose = PURPOSES.find((p) => p === body?.purpose) ?? null

  if (!purpose || !isEmail(email)) {
    return reply({ message: 'Enter your email address.' }, { status: 400 })
  }
  const generic = purpose === 'signin' ? SIGN_IN_REPLY : APPLY_REPLY

  // A bot that filled the hidden field, or posted the instant the form appeared, is told it
  // worked, and nothing is sent
  const timing = checkFormToken((body as Record<string, unknown> | null)?.formToken)
  if (filledHoneypot(body as Record<string, unknown>) || timing === 'too-fast') {
    return reply({ message: generic })
  }
  if (timing !== 'ok')
    return reply({ message: 'Please reload the page and try again.' }, { status: 400 })

  // Cloudflare Turnstile, where it is set up: the token must be genuine and earned on this form
  const human = await verifyTurnstile(
    (body as Record<string, unknown> | null)?.[TURNSTILE_FIELD],
    purpose,
    { hostname: requestHostname(request.headers) ?? new URL(request.url).hostname },
  )
  if (!human.ok) {
    payload.logger.warn(`Code request refused by the bot check (${purpose}): ${human.reason}`)
    await logSecurityEvent(payload, {
      event: 'bot-check-failed',
      email,
      ip,
      detail: `${purpose}: ${human.reason}`,
    })
    return reply(
      {
        message: TURNSTILE_REFUSED,
        retryCheck: true,
      },
      { status: 400 },
    )
  }
  if (human.note) payload.logger.warn(`Bot check skipped (${purpose}): ${human.note}`)

  if (purpose !== 'signin') {
    const { open, note } = await applicationsOpenness(payload)
    if (!open) return closedReply(note)
  }

  const limit = await hitLimits(payload, [
    {
      scope: 'member-code-email',
      subject: email,
      max: MEMBER_CODES_PER_EMAIL_PER_HOUR,
      windowSeconds: 3600,
    },
    {
      scope: 'member-code-ip',
      subject: ip,
      max: MEMBER_CODES_PER_IP_PER_HOUR,
      windowSeconds: 3600,
    },
  ])
  if (!limit.allowed) {
    await logSecurityEvent(payload, {
      event: 'member-code-rate-limited',
      email,
      ip,
      detail: purpose,
    })
    return reply(
      { message: 'Too many codes have been asked for. Try again in an hour.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  const member = await findMember(payload, email)
  const suspended = Boolean(member && !canSignIn(member.standing))
  const deliverable = !suspended && (purpose !== 'signin' || Boolean(member))

  if (purpose === 'signin' && !deliverable) {
    await logSecurityEvent(payload, {
      event: 'member-code-requested',
      email,
      ip,
      subject: member ? memberIdsOf(member) : undefined,
      detail: `signin: ${member ? `refused, ${member.standing}` : 'not registered'}`,
    })
    // A deleted record no longer holds anyone's address, so it reads as not registered
    return member && member.standing === 'suspended'
      ? reply({ message: SUSPENDED }, { status: 403 })
      : reply({ message: NOT_REGISTERED, notRegistered: true }, { status: 404 })
  }

  const challenge = await issueChallenge(payload, {
    email,
    ip,
    audience: 'member',
    purpose,
    deliverable,
  })

  await logSecurityEvent(payload, {
    event: 'member-code-requested',
    email,
    ip,
    subject: member ? memberIdsOf(member) : undefined,
    detail: `${purpose}: ${deliverable ? 'code sent' : suspended ? 'member suspended' : 'no member'}`,
  })

  if (deliverable) {
    const sent = await sendMemberCode(payload, { email, code: challenge.code, purpose })
    if (sent) {
      await logSecurityEvent(payload, { event: 'member-code-sent', email, ip, detail: purpose })
    } else if (purpose !== 'signin') {
      // Applying always sends, so saying it failed reveals nothing about the address
      return reply(
        { message: 'We could not send the code just now. Please try again in a few minutes.' },
        { status: 503 },
      )
    }
  }

  return reply({ challengeId: challenge.id, message: generic })
}
