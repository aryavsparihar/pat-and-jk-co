import { endSession } from '@/members/account'
import { idParam, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Signs one of the member's devices out */
export const DELETE = (request: Request, { params }: Params) =>
  portalHandler('sessions', async ({ payload, member }) => {
    await endSession(payload, member, await idParam(params))
    return { ok: true }
  })(request)
