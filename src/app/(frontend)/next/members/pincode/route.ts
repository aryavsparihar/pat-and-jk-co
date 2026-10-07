import { fromOurOrigin, readJson, refuseCrossSite, reply, requireMember } from '@/members/http'
import { isPinCode, placeFromPostOffices } from '@/members/pincode'
import { hitLimit } from '@/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * Town, district and state for a PIN code, from India Post's public directory
 * (api.postalpincode.in: no account, no key). Only for signed-in members, sent in the body rather
 * than the URL, and cached for a month by Next's data cache. Only the PIN code is sent. The
 * applicant can change whatever comes back, and types it all if the lookup is down.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response

  const limit = await hitLimit(auth.payload, {
    scope: 'pincode-lookup',
    subject: String(auth.member.id),
    max: 60,
    windowSeconds: 3600,
  })
  if (!limit.allowed) return reply({ message: 'Please wait a little.' }, { status: 429 })

  const body = await readJson<{ pin: string }>(request)
  const pin = String(body?.pin ?? '').trim()
  if (!isPinCode(pin)) return reply({ message: 'A PIN code is six digits.' }, { status: 400 })

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return reply({ found: false, unavailable: true })
    const data = (await response.json()) as {
      Status?: string
      PostOffice?: { Name?: string; Block?: string; District?: string; State?: string }[] | null
    }[]
    const place =
      data?.[0]?.Status === 'Success' ? placeFromPostOffices(data[0]!.PostOffice ?? []) : null
    return place ? reply({ found: true, ...place }) : reply({ found: false })
  } catch {
    // A convenience: the applicant can always type the town and district themselves
    return reply({ found: false, unavailable: true })
  }
}
