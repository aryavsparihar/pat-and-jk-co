import { requireRecentSignIn } from '@/members/recent'
import { IDENTITY_CODE_MINUTES, issueIdentityCode } from '@/kyc/identityCode'
import { openForChecking } from '@/kyc/check'
import { VERIFY_ERRORS } from '@/kyc/verify'
import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * A new identity code, good for ten minutes, for "Confirm who you are" after approval: the
 * artist's, or with { type: 'partner' } the trade partner's. Any earlier code stops working at once. The code comes back
 * in this reply only; the server keeps a hash of it (src/kyc/identityCode.ts).
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  // Identity details, documents and data requests: a sign-in within the last 30 minutes
  const stale = requireRecentSignIn(auth.session)
  if (stale) return stale

  const body = await readJson<{ type?: unknown }>(request)
  const type = body?.type === 'partner' ? 'partner' : 'artist'
  const application = await openForChecking(payload, member, type)
  if (!application) return reply({ message: VERIFY_ERRORS.codeWindow }, { status: 409 })

  const limit = await hitLimit(payload, {
    scope: 'identity-code',
    subject: String(member.id),
    max: 30,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply(
      { message: 'Please wait a moment before asking for another code.' },
      { status: 429 },
    )

  const issued = await issueIdentityCode(payload, application.id)
  return withRefresh(reply({ ...issued, minutes: IDENTITY_CODE_MINUTES }), auth.refresh)
}
