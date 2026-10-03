import { z } from 'zod'

import { archiveArtwork } from '@/members/artworks'
import { idParam, parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Archives a work, which hides it at once, or brings it back */
export const POST = (request: Request, { params }: Params) =>
  portalHandler('artworks', async ({ payload, member }) => {
    const { archived } = await parseBody(request, z.object({ archived: z.boolean() }))
    return { artwork: await archiveArtwork(payload, member, await idParam(params), archived) }
  })(request)
