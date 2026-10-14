import type { Payload } from 'payload'

import type { Member, MemberSession, User } from '@/payload-types'
import { checkChallenge, issueChallenge } from '@/security/challenges'
import { isEmail, normaliseEmail } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { revokeSession } from '@/security/memberSession'

import { memberIdsOf } from '../collections/Members'
import { findMember } from './accounts'
import { sendEmailChangedNotice, sendMemberCode, sendStaffEmailChangeNotices } from './emails'
import { PortalError } from './artworks'

const ctx = { disableRevalidate: true }

/* ─── Sessions ──────────────────────────────────────────────────────────── */

/** Every device the member is signed in on, newest first, with this one marked */
export const listSessions = async (payload: Payload, member: Member, current: MemberSession) => {
  const now = new Date().toISOString()
  const sessions = await payload.find({
    collection: 'member-sessions',
    where: {
      and: [
        { member: { equals: member.id } },
        { revokedAt: { exists: false } },
        { expiresAt: { greater_than: now } },
      ],
    },
    sort: '-lastSeenAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return sessions.docs.map((s) => ({
    id: s.id,
    device: s.device || 'A browser',
    signedInAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    current: s.id === current.id,
  }))
}

/** Signs one of the member's own devices out */
export const endSession = async (payload: Payload, member: Member, sessionId: number) => {
  const session = await payload
    .findByID({ collection: 'member-sessions', id: sessionId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const owner = session && (typeof session.member === 'object' ? session.member.id : session.member)
  if (!session || owner !== member.id)
    throw new PortalError('That session could not be found.', 404)
  await revokeSession(payload, session.sid, 'signed out from another device')
  await logSecurityEvent(payload, {
    event: 'member-session-ended',
    email: member.email,
    subject: memberIdsOf(member),
    detail: session.device ?? undefined,
  })
}

/* ─── Changing the email address ────────────────────────────────────────── */

/**
 * Step one: a code goes to the new address, and the change waits for it. Nothing changes until
 * the code comes back, so a typo, or an address that is not theirs, does nothing.
 */
export const requestEmailChange = async (
  payload: Payload,
  member: Member,
  { email, ip }: { email: unknown; ip: string },
) => {
  const next = normaliseEmail(String(email ?? ''))
  if (!isEmail(next)) throw new PortalError('Please give a full email address.')
  if (next === member.email) throw new PortalError('That is already the address on your account.')

  const challenge = await issueChallenge(payload, {
    email: next,
    ip,
    audience: 'member',
    purpose: 'email-change',
    deliverable: true,
  })
  await payload.update({
    collection: 'members',
    id: member.id,
    data: {
      emailChange: {
        pendingEmail: next,
        challengeId: challenge.id,
        requestedAt: new Date().toISOString(),
      },
    } as never,
    overrideAccess: true,
    context: ctx,
  })
  const sent = await sendMemberCode(payload, {
    email: next,
    code: challenge.code,
    purpose: 'email-change',
  })
  if (!sent) throw new PortalError('We could not send the code just now. Please try again.', 503)
  return { challengeId: challenge.id }
}

/**
 * Step two: the code from the new address. The address changes, the old one is told (with a way
 * to report it), and every other device is signed out.
 */
export const confirmEmailChange = async (
  payload: Payload,
  member: Member,
  current: MemberSession,
  { challengeId, code }: { challengeId: unknown; code: unknown },
) => {
  const full = (await payload.findByID({
    collection: 'members',
    id: member.id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })) as Member & { emailChange?: { pendingEmail?: string; challengeId?: number } }
  const pending = full.emailChange
  if (!pending?.pendingEmail || Number(challengeId) !== pending.challengeId) {
    throw new PortalError('Please ask for a new code.', 409)
  }
  const check = await checkChallenge(payload, { challengeId, code, audience: 'member' })
  if (!check.ok || check.purpose !== 'email-change' || check.email !== pending.pendingEmail) {
    throw new PortalError('That code is not right, or it has expired. Ask for a new one.', 401)
  }
  const taken = await findMember(payload, pending.pendingEmail)
  if (taken && taken.id !== member.id) {
    throw new PortalError(
      'That address already has an account with us. Please write to us and we will help.',
      409,
    )
  }

  const oldEmail = member.email
  await payload.update({
    collection: 'members',
    id: member.id,
    data: {
      email: pending.pendingEmail,
      emailChange: { pendingEmail: null, challengeId: null, requestedAt: null },
    } as never,
    overrideAccess: true,
    context: ctx,
  })
  // Every other device is signed out; this one stays signed in
  const others = await payload.find({
    collection: 'member-sessions',
    where: {
      and: [
        { member: { equals: member.id } },
        { revokedAt: { exists: false } },
        { id: { not_equals: current.id } },
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const s of others.docs) await revokeSession(payload, s.sid, 'email address changed')

  await logSecurityEvent(payload, {
    event: 'member-email-changed',
    email: pending.pendingEmail,
    subject: memberIdsOf(member),
    detail: `${others.docs.length} other session(s) ended`,
  })
  await sendEmailChangedNotice(payload, { oldEmail })
  return { email: pending.pendingEmail }
}

/**
 * When a member has lost access to their email, a KYC reviewer changes the address for them, after
 * checking who they are against the identity details on file (docs/ADMIN_GUIDE.md). Only for a
 * member with identity details to check against; a reason is required and logged with the
 * reviewer's name; every session ends; both addresses are told.
 */
export const changeEmailByStaff = async (
  payload: Payload,
  {
    memberId,
    email,
    reason,
    actor,
  }: { memberId: number; email: unknown; reason: unknown; actor: User },
) => {
  const why = String(reason ?? '').trim()
  if (why.length < 10) {
    throw new PortalError(
      'Please give a reason of at least a few words. It is kept in the security log.',
      400,
    )
  }
  const member = await payload.findByID({
    collection: 'members',
    id: memberId,
    depth: 0,
    overrideAccess: true,
  })
  const next = normaliseEmail(String(email ?? ''))
  if (!isEmail(next)) throw new PortalError('Please give a full email address.')
  if (next === member.email) throw new PortalError('That is already the address on the account.')
  const kyc = await payload.count({
    collection: 'kyc-records',
    where: { member: { equals: member.id } },
    overrideAccess: true,
  })
  if (kyc.totalDocs === 0) {
    throw new PortalError(
      'There are no identity details on file to check them against, so the address cannot be changed this way. A super admin can decide what to do.',
      409,
    )
  }
  const taken = await findMember(payload, next)
  if (taken && taken.id !== member.id) {
    throw new PortalError('That address already has an account with us.', 409)
  }

  const oldEmail = member.email
  await payload.update({
    collection: 'members',
    id: member.id,
    data: {
      email: next,
      emailChange: { pendingEmail: null, challengeId: null, requestedAt: null },
    } as never,
    overrideAccess: true,
    context: ctx,
  })
  const sessions = await payload.find({
    collection: 'member-sessions',
    where: { and: [{ member: { equals: member.id } }, { revokedAt: { exists: false } }] },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const s of sessions.docs)
    await revokeSession(payload, s.sid, 'email address changed by staff')

  await logSecurityEvent(payload, {
    event: 'member-email-changed',
    email: next,
    subject: memberIdsOf(member),
    actor: actor.id,
    detail: `Changed by ${actor.email} after an identity check: ${why.slice(0, 300)}; ${sessions.docs.length} session(s) ended`,
  })
  await sendStaffEmailChangeNotices(payload, { oldEmail, newEmail: next })
  return { email: next }
}
