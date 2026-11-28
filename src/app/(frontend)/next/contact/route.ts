import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { ContactError, startMessage } from '@/contact/flow'
import { checkContact } from '@/contact/message'
import { CONTACT_ERRORS } from '@/contact/rules'
import { checkFormToken } from '@/members/formToken'
import { fromOurOrigin, readJson, refuseCrossSite, reply } from '@/members/http'
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

const MESSAGES_PER_EMAIL_PER_HOUR = 5
const MESSAGES_PER_IP_PER_HOUR = 10

/**
 * A message from the contact page (pjk.co.in/contact). The same checks as every public form: our
 * own origin, a hidden field and a timed token against simple bots, Turnstile against the rest,
 * and limits per address and per IP. A message without files goes to PJK's inbox at once; one
 * with files is stored until they arrive (src/contact/flow.ts).
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const body = (await readJson<Record<string, unknown>>(request)) as Record<string, unknown> | null
  if (!body) return reply({ message: CONTACT_ERRORS.ourSide }, { status: 400 })

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)

  // A bot that filled the hidden field, or sent the form the instant it appeared, is told it
  // worked, and nothing is kept
  const timing = checkFormToken(body.formToken)
  if (String(body[HONEYPOT_FIELD] ?? '').trim() || timing === 'too-fast')
    return reply({ sent: true })
  if (timing !== 'ok')
    return reply({ message: 'Please reload the page and try again.' }, { status: 400 })

  // Checked before the bot check, so a mistake in the form does not spend its token
  const checked = checkContact(body)
  if (!checked.ok)
    return reply({ message: checked.message, errors: checked.errors }, { status: 400 })

  const human = await verifyTurnstile(body[TURNSTILE_FIELD], 'contact', {
    hostname: requestHostname(request.headers) ?? new URL(request.url).hostname,
  })
  if (!human.ok) {
    await logSecurityEvent(payload, {
      event: 'bot-check-failed',
      email: checked.input.email,
      ip,
      detail: `contact: ${human.reason}`,
    })
    return reply({ message: TURNSTILE_REFUSED, retryCheck: true }, { status: 400 })
  }
  if (human.note) payload.logger.warn(`Bot check skipped (contact): ${human.note}`)

  const limit = await hitLimits(payload, [
    {
      scope: 'contact-email',
      subject: checked.input.email,
      max: MESSAGES_PER_EMAIL_PER_HOUR,
      windowSeconds: 3600,
    },
    { scope: 'contact-ip', subject: ip, max: MESSAGES_PER_IP_PER_HOUR, windowSeconds: 3600 },
  ])
  if (!limit.allowed) {
    await logSecurityEvent(payload, { event: 'rate-limited', ip, detail: 'contact form' })
    return reply(
      { message: CONTACT_ERRORS.failed },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  try {
    return reply(await startMessage(payload, checked.input))
  } catch (error) {
    if (error instanceof ContactError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Contact message could not be stored' })
    return reply({ message: CONTACT_ERRORS.ourSide }, { status: 500 })
  }
}
