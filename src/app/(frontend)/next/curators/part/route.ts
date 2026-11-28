import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { PART_BYTES } from '@/contact/rules'
import { CuratorError, receiveCuratorPart } from '@/curators/flow'
import { CURATOR_ERRORS } from '@/curators/rules'
import { fromOurOrigin, refuseCrossSite, reply } from '@/members/http'

export const dynamic = 'force-dynamic'

/**
 * One part of a curator's portfolio or CV: POST /next/curators/part?id=…&file=…&part=…, the upload
 * token in X-Upload-Token, the bytes as the body. At most PART_BYTES, so a request stays under the
 * 4.5 MB a request to the site may carry.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > PART_BYTES) return reply({ message: CURATOR_ERRORS.ourSide }, { status: 413 })

  const url = new URL(request.url)
  const numbers = ['id', 'file', 'part'].map((key) => Number(url.searchParams.get(key)))
  if (numbers.some((n) => !Number.isInteger(n) || n < 0))
    return reply({ message: CURATOR_ERRORS.ourSide }, { status: 400 })
  const [id, file, part] = numbers as [number, number, number]

  let bytes: Buffer
  try {
    bytes = Buffer.from(await request.arrayBuffer())
  } catch {
    return reply({ message: CURATOR_ERRORS.failed }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  try {
    await receiveCuratorPart(
      payload,
      { id, token: request.headers.get('x-upload-token') ?? '', file, part },
      bytes,
    )
    return reply({ ok: true })
  } catch (error) {
    if (error instanceof CuratorError)
      return reply({ message: error.message, errors: error.errors }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Curator file part could not be stored' })
    return reply({ message: CURATOR_ERRORS.ourSide }, { status: 500 })
  }
}
