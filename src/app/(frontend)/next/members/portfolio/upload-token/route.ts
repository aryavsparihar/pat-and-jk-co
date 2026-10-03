import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

import { EDITABLE, findOwnApplication } from '@/members/application'
import { fromOurOrigin, refuseCrossSite, reply, requireMember } from '@/members/http'
import { blobUploadsAvailable, incomingPrefix, PORTFOLIO_MAX_BYTES } from '@/members/portfolio'

export const dynamic = 'force-dynamic'

/**
 * Lets the browser put one picture straight into Blob storage, so large photographs never pass
 * through a serverless function (whose request bodies are capped at about 4.5 MB). The token is
 * short-lived and narrow: one signed-in artist with an open application, their own folder only,
 * images only, 25 MB at most. Nothing is kept from there: the picture is then imported, checked
 * and cleaned by POST /next/members/portfolio, and the raw upload is deleted.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  if (!blobUploadsAvailable())
    return reply({ message: 'Direct uploads are not set up here.' }, { status: 404 })

  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application || !EDITABLE.includes(application.stage)) {
    return reply(
      { message: 'Pictures can only be added while your application is open.' },
      { status: 409 },
    )
  }

  try {
    const body = (await request.json()) as HandleUploadBody
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(incomingPrefix(member)) || pathname.includes('..')) {
          throw new Error('Uploads go to your own folder')
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: PORTFOLIO_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        }
      },
      // No completion callback: the import step does the work, and a callback could not reach a
      // preview behind Vercel's deployment protection anyway
    })
    return reply(result)
  } catch (error) {
    payload.logger.warn({
      msg: 'Portfolio upload token refused',
      member: member.id,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return reply({ message: 'That upload could not be started.' }, { status: 400 })
  }
}
