import { saveWorksFolder } from '@/members/artworks'
import { driveFolderSchema } from '@/members/forms/portal'
import { parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

/**
 * The approved artist's Google Drive folder, where their works are, a folder per work. Only a
 * Google Drive folder link is taken, kept in one plain form; an empty one clears it.
 */
export const POST = portalHandler(
  'works-folder',
  async ({ payload, member, request }) => {
    const { url } = await parseBody(request, driveFolderSchema)
    return saveWorksFolder(payload, member, url)
  },
  { limit: 20 },
)
