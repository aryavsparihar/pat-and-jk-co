import { notifyStaffOfBankChange, sendBankChangeNotice } from '@/members/emails'
import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { fieldErrors } from '@/members/forms/schemas'
import { bankSchema } from '@/kyc/schema'
import { KycError, requestBankChange } from '@/kyc/service'
import { checkChallenge } from '@/security/challenges'
import { clientIp } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'

export const dynamic = 'force-dynamic'

/**
 * A change of bank details after approval: the most common target of account takeover, so it
 * needs a fresh code (step-up) even inside a session, is held until staff re-verify it while the
 * old details stay in force, and is announced by email with a way to stop it.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  const ip = clientIp(request.headers)

  if (!member.artistId) {
    return reply(
      { message: 'Bank details are changed here once you are an approved artist.' },
      { status: 409 },
    )
  }

  const body = await readJson<{ challengeId: number; code: string; bank: unknown }>(request)
  const step = await checkChallenge(payload, {
    challengeId: body?.challengeId,
    code: body?.code,
    audience: 'member',
  })
  if (!step.ok || step.purpose !== 'step-up' || step.email !== member.email) {
    await logSecurityEvent(payload, {
      event: 'member-code-failed',
      email: member.email,
      ip,
      detail: 'step-up for bank change',
    })
    return reply(
      { message: 'That code is not right, or it has expired. Ask for a new one.' },
      { status: 401 },
    )
  }

  const parsed = bankSchema.safeParse(body?.bank)
  if (!parsed.success) {
    return reply(
      { message: 'A few things need another look.', errors: fieldErrors(parsed.error) },
      { status: 422 },
    )
  }

  try {
    const { record, cancelToken } = await requestBankChange(payload, { member, bank: parsed.data })
    await sendBankChangeNotice(payload, { member, cancelToken })
    await notifyStaffOfBankChange(payload, { reference: record.reference })
    return withRefresh(reply({ ok: true }), auth.refresh)
  } catch (error) {
    if (error instanceof KycError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Bank change failed' })
    return reply({ message: 'The change could not be saved. Please try again.' }, { status: 500 })
  }
}
