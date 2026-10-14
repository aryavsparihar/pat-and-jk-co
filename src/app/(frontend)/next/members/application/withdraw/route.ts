import { APIError } from 'payload'

import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { withdrawApplication } from '@/members/withdraw'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** The applicant withdraws their current application of a kind, before it is decided */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const body = await readJson<{ type?: string }>(request)
  if (body?.type !== 'artist' && body?.type !== 'partner') {
    return reply({ message: 'Choose the artist or the partner application.' }, { status: 400 })
  }

  const limit = await hitLimit(payload, {
    scope: 'application-withdraw',
    subject: String(member.id),
    max: 10,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before trying again.' }, { status: 429 })

  try {
    const application = await withdrawApplication(payload, member, body.type)
    return withRefresh(
      reply({ ok: true, reference: application.reference, stage: application.stage }),
      auth.refresh,
    )
  } catch (error) {
    if (error instanceof APIError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Could not withdraw an application' })
    return reply(
      { message: 'Your application could not be withdrawn just now. Please try later.' },
      { status: 500 },
    )
  }
}
