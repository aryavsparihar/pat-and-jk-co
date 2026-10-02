import { EDITABLE, findOwnApplication } from '@/members/application'
import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { applicationsOpenness, closedReply } from '@/members/openness'
import { fieldErrors } from '@/members/forms/schemas'
import { kycSchema } from '@/kyc/schema'
import { KycError, maskedKyc, saveKyc } from '@/kyc/service'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** The artist's own identity and bank details, masked: never a full value */
export async function GET(request: Request) {
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  return withRefresh(reply({ kyc: await maskedKyc(auth.payload, auth.member.id) }), auth.refresh)
}

/**
 * Saves the KYC step: checked, then every sensitive value encrypted before it is stored. The full
 * values never come back; the reply is the masked view. Only while the artist application is open.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const { open, note } = await applicationsOpenness(payload)
  if (!open) return closedReply(note)

  const limit = await hitLimit(payload, {
    scope: 'kyc-save',
    subject: String(member.id),
    max: 30,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before saving again.' }, { status: 429 })

  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application || !EDITABLE.includes(application.stage)) {
    return reply(
      { message: 'These details can only be changed while your application is open.' },
      { status: 409 },
    )
  }

  const parsed = kycSchema.safeParse(await readJson(request))
  if (!parsed.success) {
    return reply(
      { message: 'A few things need another look.', errors: fieldErrors(parsed.error) },
      { status: 422 },
    )
  }

  try {
    await saveKyc(payload, {
      member,
      input: parsed.data,
      legalName: application.about?.legalName,
      reference: application.reference,
    })
  } catch (error) {
    if (error instanceof KycError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'KYC save failed' })
    return reply({ message: 'Your details could not be saved. Please try again.' }, { status: 500 })
  }

  const completed = new Set(application.completedSteps ?? [])
  completed.add('kyc')
  await payload.update({
    collection: 'applications',
    id: application.id,
    data: { completedSteps: [...completed] },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

  return withRefresh(
    reply({ ok: true, kyc: await maskedKyc(payload, member.id), completedSteps: [...completed] }),
    auth.refresh,
  )
}
