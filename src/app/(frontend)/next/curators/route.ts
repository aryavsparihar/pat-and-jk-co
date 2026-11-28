import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { checkCurator } from '@/curators/check'
import { CuratorError, startCuratorApplication } from '@/curators/flow'
import { CURATOR_ERRORS, CURATOR_NOTICE_VERSION, curatorNoticeText } from '@/curators/rules'
import { consentEvidence } from '@/members/consentRecord'
import { checkFormToken } from '@/members/formToken'
import { fromOurOrigin, readJson, refuseCrossSite, reply } from '@/members/http'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { hitLimits } from '@/security/rateLimit'
import {
  requestHostname,
  TURNSTILE_FIELD,
  TURNSTILE_REFUSED,
  verifyTurnstile,
} from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

export const dynamic = 'force-dynamic'

const PER_EMAIL_PER_DAY = 5
const PER_IP_PER_HOUR = 10

/**
 * A guest curator's application, from the public form (pjk.co.in/collaborate/curators). No account
 * is needed, so it has the checks of every public form: our own origin, a hidden field and a timed
 * token against simple bots, Turnstile against the rest, and limits per address and per IP. The
 * answers are kept here; the portfolio and CV follow in parts (src/curators/flow.ts).
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const body = (await readJson<Record<string, unknown>>(request)) as Record<string, unknown> | null
  if (!body) return reply({ message: CURATOR_ERRORS.ourSide }, { status: 400 })

  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)

  // A bot that filled the hidden field, or sent the form the instant it appeared, is refused
  // without being told why
  const timing = checkFormToken(body.formToken)
  if (String(body[HONEYPOT_FIELD] ?? '').trim() || timing === 'too-fast')
    return reply({ message: CURATOR_ERRORS.failed }, { status: 400 })
  if (timing !== 'ok')
    return reply({ message: 'Please reload the page and try again.' }, { status: 400 })

  // Checked before the bot check, so a mistake in the form does not spend its token
  const checked = checkCurator(body)
  if (!checked.ok)
    return reply({ message: checked.message, errors: checked.errors }, { status: 422 })

  const human = await verifyTurnstile(body[TURNSTILE_FIELD], 'curator', {
    hostname: requestHostname(request.headers) ?? new URL(request.url).hostname,
  })
  if (!human.ok) {
    await logSecurityEvent(payload, {
      event: 'bot-check-failed',
      email: checked.input.answers.email,
      ip,
      detail: `curator: ${human.reason}`,
    })
    return reply({ message: TURNSTILE_REFUSED, retryCheck: true }, { status: 400 })
  }
  if (human.note) payload.logger.warn(`Bot check skipped (curator): ${human.note}`)

  const limit = await hitLimits(payload, [
    {
      scope: 'curator-email',
      subject: checked.input.answers.email,
      max: PER_EMAIL_PER_DAY,
      windowSeconds: 86_400,
    },
    { scope: 'curator-ip', subject: ip, max: PER_IP_PER_HOUR, windowSeconds: 3600 },
  ])
  if (!limit.allowed) {
    await logSecurityEvent(payload, { event: 'rate-limited', ip, detail: 'curator form' })
    return reply(
      { message: CURATOR_ERRORS.failed },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  try {
    return reply(
      await startCuratorApplication(
        payload,
        checked.input,
        await consentEvidence(request, CURATOR_NOTICE_VERSION, curatorNoticeText()),
      ),
    )
  } catch (error) {
    if (error instanceof CuratorError)
      return reply({ message: error.message, errors: error.errors }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Curator application could not be stored' })
    return reply({ message: CURATOR_ERRORS.failed }, { status: 500 })
  }
}
