import { submitArtistApplication } from '@/members/application'
import { ARTIST_NOTICE_VERSION, artistNoticeText } from '@/members/applicationNotice'
import { consentEvidence } from '@/members/consentRecord'
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
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** Sends the finished artist application, after re-checking every step from what is stored */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const { open, note } = await applicationsOpenness(payload)
  if (!open) return closedReply(note)

  const body = await readJson<Record<string, unknown>>(request)
  if (filledHoneypot(body))
    return reply(
      { message: 'Your application could not be sent. Please try again in a minute.' },
      { status: 400 },
    )

  const limit = await hitLimit(payload, {
    scope: 'application-submit',
    subject: String(member.id),
    max: 10,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a moment before trying again.' }, { status: 429 })

  const result = await submitArtistApplication(
    payload,
    member,
    await consentEvidence(request, ARTIST_NOTICE_VERSION, artistNoticeText()),
  )
  if (!result.ok)
    return reply({ message: result.message, errors: result.errors }, { status: result.status })
  return withRefresh(reply({ ok: true, reference: result.application.reference }), auth.refresh)
}
