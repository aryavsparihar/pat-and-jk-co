import { submitPartnerApplication } from '@/members/application'
import { checkFormToken } from '@/members/formToken'
import { applicationsOpenness, closedReply } from '@/members/openness'
import {
  filledHoneypot,
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { clientIp } from '@/security/constants'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** Saves and sends the partner application: the form is a single page after the email check */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const { open, note } = await applicationsOpenness(payload)
  if (!open) return closedReply(note)

  const body = await readJson<{ data: unknown; formToken: string }>(request)
  if (filledHoneypot(body as Record<string, unknown>)) {
    return reply({ message: 'Your application could not be sent.' }, { status: 400 })
  }
  if (checkFormToken(body?.formToken) !== 'ok') {
    return reply({ message: 'Please reload the page and try again.' }, { status: 400 })
  }

  const limit = await hitLimit(payload, {
    scope: 'application-submit',
    subject: String(member.id),
    max: 10,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before trying again.' }, { status: 429 })

  const result = await submitPartnerApplication(
    payload,
    member,
    body?.data,
    clientIp(request.headers),
  )
  if (!result.ok)
    return reply({ message: result.message, errors: result.errors }, { status: result.status })
  return withRefresh(reply({ ok: true, reference: result.application.reference }), auth.refresh)
}
