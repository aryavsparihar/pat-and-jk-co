import { APIError } from 'payload'

import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { deleteDraft } from '@/members/withdraw'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** The applicant deletes an application of a kind that they have not sent */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const body = await readJson<{ type?: string }>(request)
  if (body?.type !== 'artist' && body?.type !== 'partner') {
    return reply({ message: 'Choose the artist or the trade application.' }, { status: 400 })
  }

  const limit = await hitLimit(payload, {
    scope: 'application-withdraw',
    subject: String(member.id),
    max: 10,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a moment before trying again.' }, { status: 429 })

  try {
    const { reference } = await deleteDraft(payload, member, body.type)
    return withRefresh(reply({ ok: true, reference }), auth.refresh)
  } catch (error) {
    if (error instanceof APIError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Could not delete a draft application' })
    return reply(
      { message: 'Your draft could not be deleted just now. Please try again in a minute.' },
      { status: 500 },
    )
  }
}
