import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { CuratorError, finishCuratorApplication } from '@/curators/flow'
import { CURATOR_ERRORS } from '@/curators/rules'
import { fromOurOrigin, readJson, refuseCrossSite, reply } from '@/members/http'

export const dynamic = 'force-dynamic'

/** Every file of a curator's application has arrived: keep them, and show it to the team */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const body = await readJson<{ id: number; token: string }>(request)
  const payload = await getPayload({ config: configPromise })
  try {
    return reply(
      await finishCuratorApplication(payload, {
        id: Number(body?.id),
        token: String(body?.token ?? ''),
      }),
    )
  } catch (error) {
    if (error instanceof CuratorError)
      return reply({ message: error.message, errors: error.errors }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Curator application could not be finished' })
    return reply({ message: CURATOR_ERRORS.ourSide }, { status: 500 })
  }
}
