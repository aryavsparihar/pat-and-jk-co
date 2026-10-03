import { artworkSchema } from '@/members/forms/portal'
import { updateArtwork } from '@/members/artworks'
import { idParam, parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Changes to a work go to review; the approved version stays public meanwhile */
export const PATCH = (request: Request, { params }: Params) =>
  portalHandler(
    'artworks',
    async ({ payload, member }) => ({
      artwork: await updateArtwork(
        payload,
        member,
        await idParam(params),
        await parseBody(request, artworkSchema),
      ),
    }),
    { limit: 120 },
  )(request)
