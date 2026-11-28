import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { ContactError, finishMessage } from '@/contact/flow'
import { CONTACT_ERRORS } from '@/contact/rules'
import { fromOurOrigin, readJson, refuseCrossSite, reply } from '@/members/http'

export const dynamic = 'force-dynamic'

/** Every file of a contact message has arrived: keep them, and send the message to PJK */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const body = await readJson<{ id: number; token: string }>(request)
  const payload = await getPayload({ config: configPromise })
  try {
    await finishMessage(payload, { id: Number(body?.id), token: String(body?.token ?? '') })
    return reply({ sent: true })
  } catch (error) {
    if (error instanceof ContactError)
      return reply({ message: error.message, errors: error.errors }, { status: error.status })
    payload.logger.error({ err: error, msg: 'Contact message could not be finished' })
    return reply({ message: CONTACT_ERRORS.ourSide }, { status: 500 })
  }
}
