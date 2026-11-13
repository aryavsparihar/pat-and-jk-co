import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { sendHelpAcknowledgement, sendHelpRequest } from '@/help/emails'
import { type HelpRequest, parseHelpRequest } from '@/help/request'
import { checkFormToken } from '@/members/formToken'
import { fromOurOrigin, refuseCrossSite, reply } from '@/members/http'
import { newHelpTicket } from '@/members/ids'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { hitLimits } from '@/security/rateLimit'
import {
  TURNSTILE_FIELD,
  TURNSTILE_REFUSED,
  requestHostname,
  verifyTurnstile,
} from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

export const dynamic = 'force-dynamic'

const REQUESTS_PER_EMAIL_PER_HOUR = 3
const REQUESTS_PER_IP_PER_HOUR = 6

/** A new ticket number, tried again on the rare clash: the unique index is what decides */
const createTicket = async (payload: Payload, request: HelpRequest): Promise<string> => {
  for (let attempt = 0; ; attempt++) {
    const ticket = newHelpTicket()
    try {
      await payload.create({
        collection: 'help-tickets',
        overrideAccess: true,
        data: {
          ticket,
          requestType: request.requestType,
          nature: request.nature,
          memberCode: request.memberCode,
        },
      })
      return ticket
    } catch (error) {
      if (attempt >= 4) throw error
    }
  }
}

/**
 * A Help Center request (pjk.co.in/help). The same checks as every public form: our own origin, a
 * hidden field and a timed token against simple bots, Turnstile against the rest, and limits per
 * address and per IP, since the acknowledgement goes to whatever address was typed.
 *
 * A ticket number is logged, PJK's inbox is sent the request with its files, and the sender is
 * sent the acknowledgement. If PJK's copy cannot be sent the sender is told to try again, and the
 * ticket is withdrawn so no number exists for a request nobody received.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return reply(
      { message: 'Your request could not be read. The attachments may be too large.' },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)
  const done = { message: 'Your request has been sent.' }

  // A bot that filled the hidden field, or sent the form the instant it appeared, is told it
  // worked, and nothing is sent
  const timing = checkFormToken(form.get('formToken'))
  if (String(form.get(HONEYPOT_FIELD) ?? '').trim() || timing === 'too-fast') return reply(done)
  if (timing !== 'ok')
    return reply({ message: 'Please reload the page and try again.' }, { status: 400 })

  // Checked before the bot check, so a mistake in the form does not spend its token
  const parsed = await parseHelpRequest(form)
  if (!parsed.ok) return reply({ message: parsed.message }, { status: 400 })
  const help = parsed.request

  const human = await verifyTurnstile(form.get(TURNSTILE_FIELD), 'help-request', {
    hostname: requestHostname(request.headers) ?? new URL(request.url).hostname,
  })
  if (!human.ok) {
    await logSecurityEvent(payload, {
      event: 'bot-check-failed',
      email: help.email,
      ip,
      detail: `help-request: ${human.reason}`,
    })
    return reply({ message: TURNSTILE_REFUSED, retryCheck: true }, { status: 400 })
  }
  if (human.note) payload.logger.warn(`Bot check skipped (help-request): ${human.note}`)

  const limit = await hitLimits(payload, [
    {
      scope: 'help-request-email',
      subject: help.email,
      max: REQUESTS_PER_EMAIL_PER_HOUR,
      windowSeconds: 3600,
    },
    { scope: 'help-request-ip', subject: ip, max: REQUESTS_PER_IP_PER_HOUR, windowSeconds: 3600 },
  ])
  if (!limit.allowed) {
    return reply(
      { message: 'Too many requests have been sent. Please try again in an hour.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  const ticket = await createTicket(payload, help)
  const sent = await sendHelpRequest(payload, ticket, help)
  if (!sent) {
    await payload
      .delete({
        collection: 'help-tickets',
        where: { ticket: { equals: ticket } },
        overrideAccess: true,
      })
      .catch(() => undefined)
    return reply(
      { message: 'We could not send your request just now. Please try again in a few minutes.' },
      { status: 503 },
    )
  }
  // The request reached PJK; a failed acknowledgement does not undo that
  const acknowledged = await sendHelpAcknowledgement(payload, ticket, help)

  return reply({ ticket, acknowledged, message: done.message })
}
