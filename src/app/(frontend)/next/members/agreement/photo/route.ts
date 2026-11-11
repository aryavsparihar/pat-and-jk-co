import { receiveAgreementPhoto } from '@/agreements/service'
import { KYC_DOCUMENT_MAX_BYTES } from '@/kyc/service'
import { fromOurOrigin, refuseCrossSite, reply, requireMember, withRefresh } from '@/members/http'
import { requireRecentSignIn } from '@/members/recent'
import { hitLimit } from '@/security/rateLimit'

import { agreementFor, agreementProblem } from '../shared'

export const dynamic = 'force-dynamic'

/**
 * The live photo for signing an agreement: the member holding a paper with the ten-minute code,
 * their full legal name and their ID. Multipart: kind, id, identityCode, capturedWith, file.
 * Encrypted on the server into the KYC vault, as the application's identity photo is.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  const stale = requireRecentSignIn(auth.session)
  if (stale) return stale

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return reply({ message: 'Please choose a photo.' }, { status: 400 })
  }
  const found = agreementFor(member, form.get('kind'), form.get('id'))
  if ('refused' in found) return found.refused

  const limit = await hitLimit(payload, {
    scope: 'agreement-photo',
    subject: String(member.id),
    max: 15,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before trying again.' }, { status: 429 })

  const file = form.get('file')
  if (!(file instanceof File)) return reply({ message: 'Please choose a photo.' }, { status: 400 })
  if (file.size > KYC_DOCUMENT_MAX_BYTES)
    return reply({ message: 'That photo is larger than 4 MB.' }, { status: 413 })

  try {
    const received = await receiveAgreementPhoto(payload, member, found.agreement, {
      bytes: Buffer.from(await file.arrayBuffer()),
      code: String(form.get('identityCode') ?? '').toUpperCase(),
      capturedWith: form.get('capturedWith') === 'camera' ? 'camera' : 'upload',
    })
    return withRefresh(
      reply({ document: { id: received.documentId }, at: received.at }, { status: 201 }),
      auth.refresh,
    )
  } catch (error) {
    const problem = agreementProblem(error)
    if (problem) return problem
    payload.logger.error({ err: error, msg: 'Agreement photo upload failed' })
    return reply({ message: 'The photo could not be saved. Please try again.' }, { status: 500 })
  }
}
