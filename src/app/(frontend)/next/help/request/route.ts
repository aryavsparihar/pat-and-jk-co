import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import {
  type StoredAttachment,
  deleteHelpAttachments,
  storeHelpAttachments,
} from '@/help/attachments'
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
const createTicket = async (
  payload: Payload,
  request: HelpRequest,
  attachments: StoredAttachment[],
): Promise<string> => {
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
          status: 'active',
          attachments,
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
 * A ticket number is logged with the files (encrypted, for staff to open from the ticket), PJK's
 * inbox is sent the request with its files, and the sender is sent the acknowledgement. If PJK's copy cannot be sent the sender is told to try again, and the
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

  // Kept so staff can open them from the ticket. If the store cannot take them the request still
  // goes, with the files in the email as before
  let stored: StoredAttachment[] = []
  if (help.attachments.length) {
    try {
      stored = await storeHelpAttachments(help.attachments)
    } catch (error) {
      payload.logger.error({ err: error, msg: 'Help Center files could not be stored' })
    }
  }

  // A follow-up joins the ticket the sender already has, if it is theirs; otherwise a new number
  let ticket: string
  let followUp: { id: number; attachments: unknown[]; followUps: number } | null = null
  if (help.existingTicket) {
    const found = await payload
      .find({
        collection: 'help-tickets',
        where: { ticket: { equals: help.existingTicket } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        showHiddenFields: true,
      })
      .then((r) => r.docs[0])
    // The ID they gave must be the one the ticket was raised with, so nobody can add to a
    // stranger's ticket by guessing its number
    if (!found || (found.memberCode ?? '').toUpperCase() !== help.memberCode.toUpperCase()) {
      await deleteHelpAttachments(stored)
      return reply(
        {
          message: `We could not find ticket ${help.existingTicket} for that ${help.requestType === 'artist' ? 'Artist ID' : 'Trade Partner ID'}. Check the ticket ID, or untick the box to raise a new request.`,
        },
        { status: 400 },
      )
    }
    ticket = found.ticket
    followUp = {
      id: found.id,
      attachments: (found.attachments ?? []) as unknown[],
      followUps: found.followUps ?? 0,
    }
  } else {
    try {
      ticket = await createTicket(payload, help, stored)
    } catch (error) {
      await deleteHelpAttachments(stored)
      throw error
    }
  }
  const sent = await sendHelpRequest(payload, ticket, help)
  if (!sent) {
    await deleteHelpAttachments(stored)
    // A new ticket is withdrawn; an existing one is left as it was
    if (!followUp)
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
  if (followUp) {
    // The new files join the ticket's, and a resolved ticket is open again
    await payload.update({
      collection: 'help-tickets',
      id: followUp.id,
      data: {
        attachments: [...followUp.attachments, ...stored],
        followUps: followUp.followUps + 1,
        lastFollowUpAt: new Date().toISOString(),
        status: 'active',
      } as never,
      overrideAccess: true,
    })
  }
  // The request reached PJK; a failed acknowledgement does not undo that
  const acknowledged = await sendHelpAcknowledgement(payload, ticket, help)

  return reply({ ticket, acknowledged, message: done.message })
}
