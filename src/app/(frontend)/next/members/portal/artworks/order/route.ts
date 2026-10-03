import { z } from 'zod'

import { reorderArtworks } from '@/members/artworks'
import { parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

/** The artist's order for their works: every one of their ids, in the new order */
export const POST = portalHandler('artworks', async ({ payload, member, request }) => {
  const { ids } = await parseBody(
    request,
    z.object({ ids: z.array(z.coerce.number().int().positive()).max(500) }),
  )
  return { artworks: await reorderArtworks(payload, member, ids) }
})
