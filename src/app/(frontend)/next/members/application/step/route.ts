import { saveArtistStep } from '@/members/application'
import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** Saves one step of the artist application, server-side, so it can be resumed from anywhere */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const limit = await hitLimit(payload, {
    scope: 'application-save',
    subject: String(member.id),
    max: 120,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before saving again.' }, { status: 429 })

  const body = await readJson<{ step: string; data: unknown }>(request)
  const result = await saveArtistStep(payload, member, body?.step, body?.data)
  if (!result.ok)
    return reply({ message: result.message, errors: result.errors }, { status: result.status })
  return withRefresh(
    reply({ ok: true, completedSteps: result.application.completedSteps ?? [] }),
    auth.refresh,
  )
}
