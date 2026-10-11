import { APIError } from 'payload'

import { applicationsOpenness, closedReply } from '@/members/openness'
import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { reopenApplication } from '@/members/reapply'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** Applying again after a decline, once the wait is over: the same application reopens */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const { open, note } = await applicationsOpenness(payload)
  if (!open) return closedReply(note)

  const body = await readJson<{ type?: string }>(request)
  const type = body?.type === 'partner' ? 'partner' : 'artist'

  const limit = await hitLimit(payload, {
    scope: 'application-reapply',
    subject: String(member.id),
    max: 5,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before trying again.' }, { status: 429 })

  try {
    const application = await reopenApplication(payload, member, type)
    return withRefresh(reply({ ok: true, reference: application.reference }), auth.refresh)
  } catch (error) {
    if (error instanceof APIError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Could not reopen an application' })
    return reply(
      { message: 'Your application could not be opened again. Please try later.' },
      { status: 500 },
    )
  }
}
