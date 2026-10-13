import { z } from 'zod'

import { requestEmailChange } from '@/members/account'
import { parseBody, portalHandler } from '@/members/portalHttp'
import { clientIp } from '@/security/constants'

export const dynamic = 'force-dynamic'

/** Step one of changing the email address: a code to the new address */
export const POST = portalHandler(
  'email',
  async ({ payload, member, request }) => {
    const { email } = await parseBody(request, z.object({ email: z.string().max(254) }))
    const { challengeId } = await requestEmailChange(payload, member, {
      email,
      ip: clientIp(request.headers),
    })
    return { challengeId, message: 'A code is on its way to the new address.' }
  },
  { limit: 5, recent: true },
)
