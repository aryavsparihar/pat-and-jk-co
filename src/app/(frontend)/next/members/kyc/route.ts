import { after } from 'next/server'

import { identityChecked, identitySent } from '@/kyc/check'
import { identityFingerprint } from '@/kyc/identityCode'
import {
  checkStoredAadhaar,
  identityPhotoFacts,
  KycError,
  maskedKyc,
  recordAadhaarCheck,
  runAadhaarCheck,
  saveIdentity,
  savedIdentityValues,
} from '@/kyc/service'
import { AADHAAR_CHECK_MODE } from '@/kyc/settings'
import { checkVerify, VERIFY_ERRORS as E, VERIFY_NOTICE_VERSION } from '@/kyc/verify'
import { findOwnApplication } from '@/members/application'
import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { recentlyConfirmed, requireRecentSignIn } from '@/members/recent'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/** Whose check this is: an artist's, or with { for: 'partner' } a trade partner's */
const kindOf = (value: unknown) => (value === 'partner' ? 'partner' : 'artist')

/** The member's own identity details (and payout details, once added), masked: never a full value */
export async function GET(request: Request) {
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const kyc = await maskedKyc(auth.payload, auth.member.id)
  // Payout details, even masked, are shown only after a sign-in within the last 30 minutes
  const payoutsLocked =
    Boolean(kyc && (kyc.bank || kyc.pendingBank)) && !recentlyConfirmed(auth.session)
  return withRefresh(
    reply({
      kyc: kyc && payoutsLocked ? { ...kyc, bank: null, pendingBank: null } : kyc,
      payoutsLocked,
      noticeVersion: VERIFY_NOTICE_VERSION,
    }),
    auth.refresh,
  )
}

/**
 * "Confirm who you are", after approval (src/kyc/verify.ts). `send: true` checks everything and
 * sends it for the team to check; without it, what is there is kept to finish later. Every
 * sensitive value is encrypted before it is stored, and the reply is the masked view. Once sent,
 * nothing changes here until the team has looked: they mark it checked, which unlocks the
 * agreement, or send it back with a note.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  // Identity details, documents and data requests: a sign-in within the last 30 minutes
  const stale = requireRecentSignIn(auth.session)
  if (stale) return stale

  const limit = await hitLimit(payload, {
    scope: 'kyc-save',
    subject: String(member.id),
    max: 30,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a moment before trying again.' }, { status: 429 })

  const body = (await readJson<Record<string, unknown>>(request)) ?? {}
  const kind = kindOf(body.for)
  const send = body.send === true
  const application = await findOwnApplication(payload, member, kind, 0)
  if (!application || application.stage !== 'approved')
    return reply({ message: E.notApproved }, { status: 409 })

  const current = await payload.find({
    collection: 'kyc-records',
    where: { member: { equals: member.id } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const record = current.docs[0]
  if (identitySent(record) || identityChecked(record))
    return reply({ message: E.closed }, { status: 409 })

  // What was saved to finish later stands unless it is typed again: it never comes back to the
  // page, so the page leaves those boxes empty
  const saved = await savedIdentityValues(payload, member.id)
  for (const field of ['pan', 'panName', 'passportNumber', 'passportName', 'aadhaarLast4'] as const)
    if (!String(body[field] ?? '').trim() && saved[field]) body[field] = saved[field]

  const checked = checkVerify(kind, body, { draft: !send })
  if (!checked.ok)
    return reply(
      { message: 'A few things need another look.', errors: checked.errors },
      { status: 422 },
    )
  const input = checked.input

  if (send && input.noticeVersion !== VERIFY_NOTICE_VERSION) {
    return reply({ message: E.noticeChanged, errors: { consent: E.noticeChanged } }, { status: 409 })
  }

  // The photo must show the name given now (and an artist's date of birth); its code is kept
  const dateOfBirth = kind === 'artist' ? (application.about?.dateOfBirth ?? null) : null
  const photoId = input.documents['identity-photo']
  const photo = photoId
    ? await identityPhotoFacts(payload, { memberId: member.id, documentId: photoId })
    : null
  if (send && (!photo || photo.fingerprint !== identityFingerprint(input.nameOnId, dateOfBirth))) {
    return reply(
      { message: E.photoRetake, errors: { 'documents.identity-photo': E.photoChanged } },
      { status: 422 },
    )
  }

  const aadhaarDocument =
    send && input.idChoice === 'aadhaar' ? input.documents['masked-aadhaar'] : undefined
  const checkInput = aadhaarDocument
    ? {
        memberId: member.id,
        documentId: aadhaarDocument,
        // Held in memory for the check only; never stored, never logged
        password: input.aadhaarPassword,
        last4: input.aadhaarLast4,
        panName: input.panName,
        dateOfBirth,
      }
    : null

  // Enforcing: a masked e-Aadhaar that cannot be checked stops here, with the reason
  if (checkInput && AADHAAR_CHECK_MODE === 'enforcing') {
    try {
      const check = await checkStoredAadhaar(payload, checkInput)
      if (check.result === 'not-verified') {
        if (check.unmasked) await recordAadhaarCheck(payload, checkInput, check)
        return reply(
          {
            message: E.aadhaarNotChecked,
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

  let kept
  try {
    kept = await saveIdentity(payload, {
      member,
      input,
      reference: application.reference,
      identityCode: photo,
      send,
      consent: send
        ? {
            noticeVersion: VERIFY_NOTICE_VERSION,
            confirmation:
              'Ticked "I have read how PAT & J.K. Co. will use my identity details, and I agree to it" and typed I AGREE',
          }
        : undefined,
    })
  } catch (error) {
    if (error instanceof KycError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Saving identity details failed' })
    return reply({ message: E.notSaved }, { status: 500 })
  }

  if (send) {
    const { notifyStaffOfIdentity } = await import('@/members/emails')
    const later = async () => {
      if (checkInput) await runAadhaarCheck(payload, checkInput)
      const told = await notifyStaffOfIdentity(payload, { application, recordId: kept.id })
      if (!told)
        payload.logger.error(`Staff were not emailed about identity for ${application.reference}`)
    }
    // The check runs after the member has their answer, records its result for staff, and never
    // holds anything up
    try {
      after(later)
    } catch {
      // Outside a request (tests, scripts): run it now
      await later()
    }
  }

  return withRefresh(
    reply({ ok: true, sent: send, kyc: await maskedKyc(payload, member.id) }),
    auth.refresh,
  )
}
