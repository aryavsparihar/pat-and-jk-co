import { requireRecentSignIn } from '@/members/recent'
import { EDITABLE, findOwnApplication } from '@/members/application'
import { fromOurOrigin, refuseCrossSite, reply, requireMember, withRefresh } from '@/members/http'
import { KYC_DOCUMENT_KINDS, type KycDocumentKind } from '@/kyc/schema'

/** What a partner's application asks for: no second ID, address or bank */
const PARTNER_KINDS: KycDocumentKind[] = ['pan-card', 'identity-photo']
import { CODE_PROBLEM, checkIdentityCode, identityFingerprint } from '@/kyc/identityCode'
import {
  type IdentityPhotoFacts,
  KYC_DOCUMENT_MAX_BYTES,
  KycError,
  storeKycDocument,
} from '@/kyc/service'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * One KYC document: checked by its bytes, images re-encoded (which removes EXIF), encrypted on the
 * server and kept in a private store. Sent straight to this function, never to a public store, so
 * the plain file exists only in this request's memory. Up to 4 MB: the browser shrinks photos first.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  // Identity details, documents and data requests: a sign-in within the last 30 minutes
  const stale = requireRecentSignIn(auth.session)
  if (stale) return stale

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return reply({ message: 'Please choose a file.' }, { status: 400 })
  }
  // A partner gives only their PAN card and the photo of them, while their application is open
  const type = form.get('type') === 'partner' ? 'partner' : 'artist'
  const application = await findOwnApplication(payload, member, type, 0)
  const open = application && EDITABLE.includes(application.stage)
  if (!open && (type === 'partner' || !member.artistId)) {
    return reply(
      { message: 'Documents can only be added while your application is open.' },
      { status: 409 },
    )
  }

  const limit = await hitLimit(payload, {
    scope: 'kyc-document',
    subject: String(member.id),
    max: 20,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before uploading again.' }, { status: 429 })

  const kind = String(form.get('kind') ?? '') as KycDocumentKind
  const file = form.get('file')
  if (!KYC_DOCUMENT_KINDS.includes(kind) || (type === 'partner' && !PARTNER_KINDS.includes(kind)))
    return reply({ message: 'What kind of document is this?' }, { status: 400 })
  if (!(file instanceof File)) return reply({ message: 'Please choose a file.' }, { status: 400 })
  if (file.size > KYC_DOCUMENT_MAX_BYTES)
    return reply({ message: 'That file is larger than 4 MB.' }, { status: 413 })

  // The identity photo must be taken with the current code, while it holds, and for the name (and,
  // for an artist, the date of birth) they have given; the code is kept with it for reviewers
  let identity: IdentityPhotoFacts | undefined
  if (kind === 'identity-photo') {
    if (!application || !open) {
      return reply(
        { message: 'The photo can only be added while your application is open.' },
        { status: 409 },
      )
    }
    const held = (await payload.findByID({
      collection: 'applications',
      id: application.id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })) as typeof application & {
      identityCodeHash?: string | null
      identityCodeIssuedAt?: string | null
      identityCodeExpiresAt?: string | null
    }
    const code = String(form.get('identityCode') ?? '')
    const check = checkIdentityCode(held, code)
    if (check !== 'ok') {
      return reply({ message: CODE_PROBLEM[check], codeProblem: check }, { status: 422 })
    }
    const name = String(form.get('panName') ?? '').trim()
    if (!name || name.length > 120) {
      return reply(
        { message: 'Please give your name as on your PAN before adding the photo.' },
        { status: 422 },
      )
    }
    identity = {
      code: code.toUpperCase(),
      issuedAt: held.identityCodeIssuedAt!,
      expiresAt: held.identityCodeExpiresAt!,
      capturedWith: form.get('capturedWith') === 'camera' ? 'camera' : 'upload',
      // A partner writes only the code and their name: no date of birth is asked of them
      fingerprint: identityFingerprint(name, type === 'artist' ? held.about?.dateOfBirth : null),
    }
  }

  try {
    const document = await storeKycDocument(payload, {
      member,
      kind,
      bytes: Buffer.from(await file.arrayBuffer()),
      identity,
    })
    return withRefresh(
      reply({ document: { id: document.id, kind: document.kind } }, { status: 201 }),
      auth.refresh,
    )
  } catch (error) {
    if (error instanceof KycError)
      return reply({ message: error.message }, { status: error.status })
    payload.logger.error({ err: error, msg: 'KYC document upload failed' })
    return reply(
      { message: 'That document could not be saved. Please try again.' },
      { status: 500 },
    )
  }
}
