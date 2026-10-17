import type { Payload } from 'payload'
import type { z } from 'zod'

import type { Member, MemberSession } from '@/payload-types'
import { memberIdsOf } from '@/collections/Members'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { hitLimit } from '@/security/rateLimit'

import { PortalError } from './artworks'
import { fieldErrors } from './forms/schemas'
import { fromOurOrigin, readJson, refuseCrossSite, reply, requireMember, withRefresh } from './http'
import { requireRecentSignIn } from './recent'

type Context = { payload: Payload; member: Member; session: MemberSession; request: Request }

/**
 * One member portal endpoint: signed in, from our own pages for anything that changes something,
 * rate limited per member, and with every PortalError turned into its plain message. Anything
 * else is logged without the request body and answered generically.
 */
export const portalHandler =
  <T>(
    scope: string,
    handle: (ctx: Context) => Promise<T>,
    options: {
      limit?: number
      changes?: boolean
      /** A sensitive action: needs a sign-in within the last 30 minutes (src/members/recent.ts) */
      recent?: boolean
    } = {},
  ) =>
  async (request: Request): Promise<Response> => {
    const changes = options.changes ?? request.method !== 'GET'
    if (changes && !fromOurOrigin(request)) return refuseCrossSite()
    const auth = await requireMember(request)
    if (!auth.ok) return auth.response
    const { payload, member, session } = auth
    if (options.recent) {
      const stale = requireRecentSignIn(session)
      if (stale) return stale
    }

    if (changes) {
      const limit = await hitLimit(payload, {
        scope: `portal-${scope}`,
        subject: String(member.id),
        max: options.limit ?? 120,
        windowSeconds: 3600,
      })
      if (!limit.allowed) {
        return reply({ message: 'Please wait a little before trying again.' }, { status: 429 })
      }
    }

    try {
      const result = await handle({ payload, member, session, request })
      if (changes) {
        // What members change in their own accounts belongs in the record too
        await logSecurityEvent(payload, {
          event: 'portal-saved',
          email: member.email,
          ip: clientIp(request.headers),
          subject: memberIdsOf(member),
          detail: `${scope}: ${request.method} ${new URL(request.url).pathname}`,
        })
      }
      return withRefresh(reply(result), auth.refresh)
    } catch (error) {
      if (error instanceof PortalError) {
        return reply({ message: error.message }, { status: error.status })
      }
      if (error instanceof ValidationFailed) {
        return reply(
          { message: 'A few things need another look.', errors: error.errors },
          { status: 422 },
        )
      }
      payload.logger.error({ err: error, msg: `Portal ${scope} failed`, member: member.id })
      return reply({ message: 'That could not be saved. Please try again.' }, { status: 500 })
    }
  }

export class ValidationFailed extends Error {
  constructor(public errors: Record<string, string>) {
    super('validation failed')
  }
}

/** The request's JSON, checked against a schema, or a ValidationFailed listing every problem */
export const parseBody = async <S extends z.ZodType>(request: Request, schema: S) => {
  const parsed = schema.safeParse(await readJson(request))
  if (!parsed.success) throw new ValidationFailed(fieldErrors(parsed.error))
  return parsed.data as z.infer<S>
}

/** The numeric id in a dynamic route segment, or a 404 */
export const idParam = async (params: Promise<{ id: string }>) => {
  const id = Number((await params).id)
  if (!Number.isSafeInteger(id) || id <= 0) throw new PortalError('Not found.', 404)
  return id
}
