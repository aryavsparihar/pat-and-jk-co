import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

import type { Member, MemberSession } from '@/payload-types'
import { canSignIn } from '@/members/standing'

import {
  MEMBER_COOKIE,
  MEMBER_SESSION_ABSOLUTE_SECONDS,
  MEMBER_SESSION_IDLE_SECONDS,
  MEMBER_SESSION_TOUCH_SECONDS,
} from './constants'

/**
 * Member sessions: a row per signed-in browser, and a cookie that points at it.
 *
 * The cookie is `<id>.<secret>.<signature>`:
 *   id         random, 16 bytes; which session row to look at
 *   secret     random, 32 bytes; proves the holder was given this session
 *   signature  HMAC of the two under MEMBER_SESSION_SECRET, so a forged or truncated cookie is
 *              refused before the database is touched
 *
 * The row stores only a keyed hash of the secret, so a copy of the database cannot be turned
 * into a working cookie. A session lasts a day from its last use and never more than thirty days
 * from sign-in. Signing out deletes nothing: the row is marked revoked, which keeps the history
 * and lets "sign out everywhere" end every session at once.
 */

const sessionKey = (): string => {
  const configured = process.env.MEMBER_SESSION_SECRET
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MEMBER_SESSION_SECRET is not set; member sessions cannot be signed')
  }
  // Development and tests only: derived, so a fresh checkout works without another secret
  const base = process.env.PAYLOAD_SECRET
  if (!base) throw new Error('PAYLOAD_SECRET is not set')
  return createHash('sha256').update(`member-session:${base}`).digest('base64url')
}

const hmac = (value: string) => createHmac('sha256', sessionKey()).update(value).digest('base64url')

const sameText = (a: string, b: string) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

/** The id and secret from a cookie value, or null if it is malformed or its signature is wrong */
export const parseSessionCookie = (value: string | null | undefined) => {
  if (!value) return null
  const [sid, secret, signature, ...rest] = value.split('.')
  if (rest.length > 0 || !sid || !secret || !signature) return null
  if (!TOKEN.test(sid) || !TOKEN.test(secret)) return null
  if (!sameText(signature, hmac(`${sid}.${secret}`))) return null
  return { sid, secret }
}

/** The member cookie's value from a Cookie header */
export const readMemberCookie = (headers: Headers): string | null => {
  const header = headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === MEMBER_COOKIE) return decodeURIComponent(value.join('='))
  }
  return null
}

const secure = () => process.env.NODE_ENV === 'production'

/** A Set-Cookie header for the session, lasting until it expires */
export const sessionCookieHeader = (value: string, expiresAt: Date): string => {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  return [
    `${MEMBER_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure() && 'Secure',
  ]
    .filter(Boolean)
    .join('; ')
}

/** A Set-Cookie header that removes the session cookie */
export const clearedCookieHeader = (): string =>
  [`${MEMBER_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', secure() && 'Secure']
    .filter(Boolean)
    .join('; ')

/** "Safari on macOS", nothing finer: enough to recognise a session in a list, not to track anyone */
export const describeDevice = (userAgent: string | null | undefined): string => {
  const ua = userAgent ?? ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'A browser'
  const system = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  return system ? `${browser} on ${system}` : browser
}

const token = (bytes: number) => randomBytes(bytes).toString('base64url')

/** Starts a session for a member and returns the cookie value to set. */
export const createSession = async (
  payload: Payload,
  { memberId, userAgent }: { memberId: number; userAgent?: string | null },
): Promise<{ value: string; expiresAt: Date; sid: string }> => {
  const sid = token(16)
  const secret = token(32)
  const now = Date.now()
  const absolute = new Date(now + MEMBER_SESSION_ABSOLUTE_SECONDS * 1000)
  const expiresAt = new Date(Math.min(now + MEMBER_SESSION_IDLE_SECONDS * 1000, absolute.getTime()))

  await payload.create({
    collection: 'member-sessions',
    data: {
      member: memberId,
      sid,
      secretHash: hmac(`secret:${secret}`),
      device: describeDevice(userAgent),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: expiresAt.toISOString(),
      absoluteExpiresAt: absolute.toISOString(),
      confirmedAt: new Date(now).toISOString(),
    },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

  return { value: `${sid}.${secret}.${hmac(`${sid}.${secret}`)}`, expiresAt, sid }
}

export type ActiveSession = {
  member: Member
  session: MemberSession
  /** Set when the session was extended: send this Set-Cookie back so the browser keeps it too */
  refreshCookie?: string
}

/** The member behind a cookie value, if the session is valid, unrevoked and in date. */
export const readSession = async (
  payload: Payload,
  value: string | null | undefined,
): Promise<ActiveSession | null> => {
  const parsed = parseSessionCookie(value)
  if (!parsed) return null

  const found = await payload.find({
    collection: 'member-sessions',
    where: { sid: { equals: parsed.sid } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const session = found.docs[0]
  if (!session || session.revokedAt) return null
  if (!sameText(session.secretHash, hmac(`secret:${parsed.secret}`))) return null

  const now = Date.now()
  const absolute = new Date(session.absoluteExpiresAt).getTime()
  if (new Date(session.expiresAt).getTime() <= now || absolute <= now) return null

  const memberId = typeof session.member === 'object' ? session.member.id : session.member
  const member = await payload
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true })
    .catch(() => null)
  // Suspended or deleted: no session counts. On hold still signs in, to read their account
  if (!member || !canSignIn(member.standing)) return null

  // Sliding expiry, written at most once a day rather than on every request
  let refreshCookie: string | undefined
  if (now - new Date(session.lastSeenAt).getTime() > MEMBER_SESSION_TOUCH_SECONDS * 1000) {
    const expiresAt = new Date(Math.min(now + MEMBER_SESSION_IDLE_SECONDS * 1000, absolute))
    await payload.update({
      collection: 'member-sessions',
      id: session.id,
      data: { lastSeenAt: new Date(now).toISOString(), expiresAt: expiresAt.toISOString() },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    refreshCookie = sessionCookieHeader(value!, expiresAt)
  }

  return { member, session, refreshCookie }
}

/** Ends one session. */
export const revokeSession = async (payload: Payload, sid: string, reason: string) => {
  await payload.update({
    collection: 'member-sessions',
    where: { and: [{ sid: { equals: sid } }, { revokedAt: { exists: false } }] },
    data: { revokedAt: new Date().toISOString(), revokedReason: reason },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
}

/** Ends every session a member has, everywhere. Returns how many were ended. */
export const revokeAllSessions = async (
  payload: Payload,
  memberId: number,
  reason: string,
): Promise<number> => {
  const result = await payload.update({
    collection: 'member-sessions',
    where: { and: [{ member: { equals: memberId } }, { revokedAt: { exists: false } }] },
    data: { revokedAt: new Date().toISOString(), revokedReason: reason },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  return result.docs.length
}
