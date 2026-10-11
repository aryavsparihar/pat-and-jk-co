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
import {
  checkStoredAadhaar,
  identityPhotoFacts,
  KycError,
  maskedKyc,
  recordAadhaarCheck,
  runAadhaarCheck,
  saveKyc,
} from '@/kyc/service'
import { AADHAAR_CHECK_MODE } from '@/kyc/settings'
import { after } from 'next/server'
import { hitLimit } from '@/security/rateLimit'
import { identityFingerprint } from '@/kyc/identityCode'
import { PRIVACY_NOTICE_VERSION } from '@/members/application'

export const dynamic = 'force-dynamic'

/** The artist's own identity details (and payout details, once added), masked: never a full value */
export async function GET(request: Request) {
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  return withRefresh(
    reply({
      kyc: await maskedKyc(auth.payload, auth.member.id),
      noticeVersion: PRIVACY_NOTICE_VERSION,
    }),
    auth.refresh,
  )
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

  const input = parsed.data
  if (input.noticeVersion !== PRIVACY_NOTICE_VERSION) {
    return reply(
      {
        message:
          'The privacy notice has changed since you read it. Please read it again and confirm.',
        errors: { consent: 'Please read the privacy notice again, then confirm.' },
      },
      { status: 409 },
    )
  }

  // The photo must show the name and date of birth given now, and its code is kept for reviewers
  const photo = await identityPhotoFacts(payload, {
    memberId: member.id,
    documentId: input.documents['identity-photo']!,
  })
  if (
    !photo ||
    photo.fingerprint !== identityFingerprint(input.panName, application.about?.dateOfBirth)
  ) {
    return reply(
      {
        message: 'Please take the photo of you again.',
        errors: {
          'documents.identity-photo':
            'Your name or date of birth has changed since this photo was taken. Please get a new code and take it again.',
        },
      },
      { status: 422 },
    )
  }
  const aadhaarDocument =
    input.idChoice === 'aadhaar' ? input.documents['masked-aadhaar'] : undefined
  const checkInput = aadhaarDocument
    ? {
        memberId: member.id,
        documentId: aadhaarDocument,
        // Held in memory for the check only; never stored, never logged
        password: input.aadhaarPassword,
        last4: input.aadhaarLast4,
        panName: input.panName,
        dateOfBirth: application.about?.dateOfBirth ?? null,
      }
    : null

  // Enforcing: a masked e-Aadhaar that cannot be verified stops the step here, with the reason
  if (checkInput && AADHAAR_CHECK_MODE === 'enforcing') {
    try {
      const check = await checkStoredAadhaar(payload, checkInput)
      if (check.result === 'not-verified') {
        if (check.unmasked) await recordAadhaarCheck(payload, checkInput, check)
        return reply(
          {
            message: 'We could not verify your masked e-Aadhaar.',
            errors: { 'documents.masked-aadhaar': check.reasons[0] ?? 'Please upload it again.' },
          },
          { status: 422 },
        )
      }
    } catch (error) {
      if (error instanceof KycError)
        return reply({ message: error.message }, { status: error.status })
      throw error
    }
  }

  try {
    await saveKyc(payload, {
      member,
      input,
      reference: application.reference,
      identityCode: photo,
      consent: {
        noticeVersion: PRIVACY_NOTICE_VERSION,
        confirmation: 'Read the privacy notice to the end, confirmed, and typed I AGREE',
      },
    })
  } catch (error) {
    if (error instanceof KycError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'KYC save failed' })
    return reply({ message: 'Your details could not be saved. Please try again.' }, { status: 500 })
  }

  if (checkInput) {
    // Advisory (the default): the check runs after the artist has their answer, records its
    // result for staff, and can never hold the application up
    const work = () => runAadhaarCheck(payload, checkInput).then(() => undefined)
    if (AADHAAR_CHECK_MODE === 'enforcing') await work()
    else {
      try {
        after(work)
      } catch {
        // Outside a request (tests, scripts): run it now
        await work()
      }
    }
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
