import type { PayloadRequest } from 'payload'

import { logSecurityEvent } from './events'
import { clientIp } from './constants'

/** "POST /api/kyc-records/12/reveal", without the query string */
const requestLine = (req: PayloadRequest) => {
  const url = req.url ? new URL(req.url, 'http://x') : null
  return `${req.method ?? ''} ${url?.pathname ?? ''}`.trim()
}

/**
 * Refuses a request to a staff-only action, and records the attempt in the security log: who
 * asked (if anyone was signed in), from where, and for what. Nothing from the request body.
 */
export const refuse = async (req: PayloadRequest, message = 'Not allowed.'): Promise<Response> => {
  const user = req.user as { id?: number; email?: string; collection?: string } | null
  await logSecurityEvent(req.payload, {
    event: 'access-refused',
    email: user?.email,
    ip: req.headers ? clientIp(req.headers) : undefined,
    actor: user?.collection === 'users' ? (user.id ?? null) : null,
    detail: `${requestLine(req)}${user ? ` (${user.collection})` : ' (not signed in)'}`,
  })
  return Response.json({ message }, { status: 403 })
}

export { requestLine }
