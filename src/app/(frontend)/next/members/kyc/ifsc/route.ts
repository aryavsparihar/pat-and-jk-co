import { fromOurOrigin, readJson, refuseCrossSite, reply, requireMember } from '@/members/http'
import { isIfsc, normaliseIfsc } from '@/kyc/values'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * Bank and branch for an IFSC, from Razorpay's free public directory (ifsc.razorpay.com: no
 * account, no key). Only for signed-in members, sent in the body rather than the URL, and cached
 * for a month by Next's data cache. The applicant can still correct what comes back.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response

  const limit = await hitLimit(auth.payload, {
    scope: 'ifsc-lookup',
    subject: String(auth.member.id),
    max: 60,
    windowSeconds: 3600,
  })
  if (!limit.allowed) return reply({ message: 'Please wait a little.' }, { status: 429 })

  const body = await readJson<{ ifsc: string }>(request)
  const ifsc = normaliseIfsc(String(body?.ifsc ?? ''))
  if (!isIfsc(ifsc)) return reply({ message: 'That IFSC does not look right.' }, { status: 400 })

  try {
    const response = await fetch(`https://ifsc.razorpay.com/${ifsc}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(4000),
    })
    if (response.status === 404) return reply({ found: false })
    if (!response.ok) return reply({ found: false, unavailable: true })
    const data = (await response.json()) as {
      BANK?: string
      BRANCH?: string
      CITY?: string
      STATE?: string
    }
    return reply({
      found: true,
      bank: data.BANK ?? null,
      branch: data.BRANCH ?? null,
      city: data.CITY ?? null,
      state: data.STATE ?? null,
    })
  } catch {
    // The lookup is a convenience: the applicant can always type the bank and branch themselves
    return reply({ found: false, unavailable: true })
  }
}
