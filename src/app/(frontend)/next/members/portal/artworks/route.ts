import { createArtwork, listOwnArtworks } from '@/members/artworks'
import { artworkSchema } from '@/members/forms/portal'
import { parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

/** The artist's own works, in their order, with where each review stands */
export const GET = portalHandler('artworks', async ({ payload, member }) => ({
  artworks: await listOwnArtworks(payload, member),
}))

/** A new work: kept, and sent for review before it is public */
export const POST = portalHandler(
  'artworks',
  async ({ payload, member, request }) => ({
    artwork: await createArtwork(payload, member, await parseBody(request, artworkSchema)),
  }),
  { limit: 60 },
)
