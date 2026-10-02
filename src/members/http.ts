import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import type { Member } from '@/payload-types'
import { readMemberCookie, readSession } from '@/security/memberSession'
import { getServerSideURL } from '@/utilities/getURL'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

/**
 * Small pieces every member endpoint shares.
 */

const allowedOrigins = () =>
  new Set(
    [getServerSideURL(), ...(process.env.ALLOWED_ORIGINS?.split(',') ?? [])]
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )

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

/**
 * The signed-in member for a request, or a 401 to return. Passes on a refreshed cookie when the
 * session slid forward, so callers can attach it to their reply.
 */
export const requireMember = async (
  request: Request,
): Promise<
  | { ok: true; payload: Payload; member: Member; refresh?: string }
  | { ok: false; response: Response }
> => {
  const payload = await getPayload({ config: configPromise })
  const active = await readSession(payload, readMemberCookie(request.headers))
  if (!active) {
    return { ok: false, response: reply({ message: 'Please sign in again.' }, { status: 401 }) }
  }
  return { ok: true, payload, member: active.member, refresh: active.refreshCookie }
}

/** Adds a refreshed session cookie to a reply, when there is one */
export const withRefresh = (response: Response, refresh?: string): Response => {
  if (refresh) response.headers.append('Set-Cookie', refresh)
  return response
}
