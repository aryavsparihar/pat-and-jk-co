import type { Payload, PayloadRequest } from 'payload'

import type { securityEventTypes } from '@/collections/SecurityEvents'

type Event = (typeof securityEventTypes)[number]

/** Writes to the security log. Never throws: logging must not break a sign-in attempt. */
export const logSecurityEvent = async (
  payload: Payload,
  entry: { event: Event; email?: string; ip?: string; detail?: string; req?: PayloadRequest },
): Promise<void> => {
  try {
    await payload.create({
      collection: 'security-events',
      data: {
        event: entry.event,
        email: entry.email,
        ip: entry.ip,
        detail: entry.detail?.slice(0, 500),
      },
      overrideAccess: true,
      req: entry.req,
      context: { disableRevalidate: true },
    })
  } catch (error) {
    payload.logger.error({ err: error, msg: 'Could not write security event' })
  }
}
