import {
  type PartnerSubmission,
  savePartnerDraft,
  submitPartnerApplication,
} from '@/members/application'
import { TRADE_NOTICE_VERSION, tradeNoticeText } from '@/members/applicationNotice'
import { consentEvidence } from '@/members/consentRecord'
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
import { logSecurityEvent } from '@/security/events'
import { hitLimit } from '@/security/rateLimit'
import {
  requestHostname,
  TURNSTILE_FIELD,
  TURNSTILE_REFUSED,
  verifyTurnstile,
} from '@/security/turnstile'

export const dynamic = 'force-dynamic'

/**
 * The trade application, a single page after the email check (the ApplyPartner design). With
 * `save: true` it keeps what is typed so far, unchecked, for "Save and finish later". Otherwise it
 * sends it: the answers, consent with I AGREE, and that the details are true, behind the bot
 * check (src/members/application.ts, submitPartnerApplication). No identity details are asked for
 * until after approval.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const { open, note } = await applicationsOpenness(payload)
  if (!open) return closedReply(note)

  const body = await readJson<PartnerSubmission & { formToken?: string; save?: boolean }>(request)
  if (filledHoneypot(body as Record<string, unknown>)) {
    return reply(
      { message: 'Your application could not be sent. Please try again in a minute.' },
      { status: 400 },
    )
  }
  if (checkFormToken(body?.formToken) !== 'ok') {
    return reply({ message: 'Please reload the page and try again.' }, { status: 400 })
  }

  // Saving for later sends nothing to anyone, so it needs no bot check
  if (body?.save === true) {
    const saved = await savePartnerDraft(payload, member, body.data)
    if (!saved.ok) return reply({ message: saved.message }, { status: saved.status })
    return withRefresh(reply({ ok: true, saved: true }), auth.refresh)
  }

  const limit = await hitLimit(payload, {
    scope: 'application-submit',
    subject: String(member.id),
    max: 10,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a moment before trying again.' }, { status: 429 })

  // Cloudflare Turnstile at the final step, where it is set up: earned on this form, on this site
  const ip = clientIp(request.headers)
  const human = await verifyTurnstile(
    (body as Record<string, unknown> | null)?.[TURNSTILE_FIELD],
    'partner-submit',
    { hostname: requestHostname(request.headers) ?? new URL(request.url).hostname },
  )
  if (!human.ok) {
    payload.logger.warn(`Partner application refused by the bot check: ${human.reason}`)
    await logSecurityEvent(payload, {
      event: 'bot-check-failed',
      email: member.email,
      ip,
      detail: `partner-submit: ${human.reason}`,
    })
    return reply({ message: TURNSTILE_REFUSED, retryCheck: true }, { status: 400 })
  }
  if (human.note) payload.logger.warn(`Bot check skipped (partner-submit): ${human.note}`)

  const result = await submitPartnerApplication(
    payload,
    member,
    body,
    await consentEvidence(request, TRADE_NOTICE_VERSION, tradeNoticeText()),
  )
  if (!result.ok)
    return reply({ message: result.message, errors: result.errors }, { status: result.status })
  return withRefresh(reply({ ok: true, reference: result.application.reference }), auth.refresh)
}
