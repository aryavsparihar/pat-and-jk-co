import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import type { Member, MemberSession } from '@/payload-types'
import { readMemberCookie, readSession } from '@/security/memberSession'
import { canChange, ON_HOLD_MESSAGE } from './standing'
import { trustedOrigins } from '@/utilities/getURL'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

/**
 * Small pieces every member endpoint shares.
 */

const allowedOrigins = () => new Set(trustedOrigins())

/**
 * State-changing member requests must come from the site's own pages. The session cookie is
 * SameSite=Lax, which already keeps it off cross-site POSTs; checking Origin as well means a
 * request from anywhere else is refused before any work is done.
 */
export const fromOurOrigin = (request: Request): boolean => {
  const origin = request.headers.get('origin')
  if (!origin) return false
  if (allowedOrigins().has(origin)) return true
  // Any brand domain the request was addressed to (the site serves several hosts)
  const host = request.headers.get('host')
  return Boolean(host) && (origin === `https://${host}` || origin === `http://${host}`)
}

/** JSON that is never cached: everything a member endpoint returns is personal */
export const reply = (body: unknown, init: { status?: number; headers?: HeadersInit } = {}) => {
  const headers = new Headers(init.headers)
  headers.set('Cache-Control', 'no-store')
  return Response.json(body, { status: init.status ?? 200, headers })
}

export const refuseCrossSite = () =>
  reply({ message: 'This request must come from the PAT and J.K. Co. website.' }, { status: 403 })

export const readJson = async <T extends object>(request: Request): Promise<Partial<T> | null> => {
  try {
    const body = (await request.json()) as unknown
    return body && typeof body === 'object' ? (body as Partial<T>) : null
  } catch {
    return null
  }
}

/** True if the hidden honeypot field came back filled in: a bot, not a person */
export const filledHoneypot = (body: Record<string, unknown> | null): boolean =>
  Boolean(body && String(body[HONEYPOT_FIELD] ?? '').trim())

/** What someone whose account is on hold may still do: end sessions, and their data rights */
const ALLOWED_ON_HOLD = [
  '/next/members/portal/sessions',
  '/next/members/data-request',
  '/next/members/step-up',
]

/** When the database cannot be reached; what was saved before is still there */
export const UNAVAILABLE =
  'We could not reach our records just now, so nothing was changed. Please try again in a minute: what you typed is still here.'

/**
 * The signed-in member for a request, or a 401 to return. Passes on a refreshed cookie when the
 * session slid forward, so callers can attach it to their reply.
 */
export const requireMember = async (
  request: Request,
): Promise<
  | { ok: true; payload: Payload; member: Member; session: MemberSession; refresh?: string }
  | { ok: false; response: Response }
> => {
  const payload = await getPayload({ config: configPromise })
  let active: Awaited<ReturnType<typeof readSession>>
  try {
    active = await readSession(payload, readMemberCookie(request.headers))
  } catch (error) {
    // The database could not be reached: say so plainly, never with the error itself
    payload.logger.error({ err: error, msg: 'Could not read a member session' })
    return { ok: false, response: reply({ message: UNAVAILABLE }, { status: 503 }) }
  }
  if (!active) {
    return { ok: false, response: reply({ message: 'Please sign in again.' }, { status: 401 }) }
  }
  // An account on hold reads, and changes nothing: every change is refused here, so no endpoint
  // can forget to, except signing out of other devices and asking for their data
  if (
    !canChange(active.member.standing) &&
    request.method !== 'GET' &&
    !ALLOWED_ON_HOLD.some((path) => new URL(request.url).pathname.startsWith(path))
  ) {
    return { ok: false, response: reply({ message: ON_HOLD_MESSAGE }, { status: 423 }) }
  }
  return {
    ok: true,
    payload,
    member: active.member,
    session: active.session,
    refresh: active.refreshCookie,
  }
}

/** Adds a refreshed session cookie to a reply, when there is one */
export const withRefresh = (response: Response, refresh?: string): Response => {
  if (refresh) response.headers.append('Set-Cookie', refresh)
  return response
}
