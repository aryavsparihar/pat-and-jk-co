import { z } from 'zod'

import { confirmEmailChange } from '@/members/account'
import { parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

/** Step two: the code from the new address makes the change */
export const POST = portalHandler(
  'email-confirm',
  async ({ payload, member, session, request }) => {
    const body = await parseBody(
      request,
      z.object({ challengeId: z.coerce.number(), code: z.string().max(12) }),
    )
    const { email } = await confirmEmailChange(payload, member, session, body)
    return { email, message: 'Your email address has been changed.' }
  },
  { limit: 20 },
)
