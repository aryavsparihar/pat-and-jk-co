import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  ACCESS_REQUESTS_PER_IP_PER_DAY,
  clientIp,
  isCompanyEmail,
  normaliseEmail,
} from '@/security/constants'
import { notifyAccessRequest } from '@/security/email'
import { logSecurityEvent } from '@/security/events'

export const dynamic = 'force-dynamic'

const acknowledgement = {
  message: 'Thank you. Your request has been sent to the technical director for approval.',
}

/**
 * Asks for an admin account. Nothing is granted here: a super admin has to approve the
 * request before an account exists, and only then can a sign-in code be sent.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)

  let email = ''
  let name = ''
  let message = ''
  try {
    const body = (await request.json()) as { email?: string; name?: string; message?: string }
    email = normaliseEmail(body.email)
    name = String(body.name ?? '').slice(0, 120)
    message = String(body.message ?? '').slice(0, 1000)
  } catch {
    return Response.json({ message: 'Please fill in the form.' }, { status: 400 })
  }

  if (!isCompanyEmail(email)) {
    return Response.json(
      { message: 'Only PAT and J.K. Co. email addresses can be given admin access.' },
      { status: 400 },
    )
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const recent = await payload.count({
    collection: 'access-requests',
    where: { and: [{ ip: { equals: ip } }, { createdAt: { greater_than: since } }] },
    overrideAccess: true,
  })
  if (recent.totalDocs >= ACCESS_REQUESTS_PER_IP_PER_DAY) {
    await logSecurityEvent(payload, {
      event: 'code-rate-limited',
      email,
      ip,
      detail: 'access requests',
    })
    return Response.json(acknowledgement)
  }

  const [existingUser, existingRequest] = await Promise.all([
    payload.count({
      collection: 'users',
      where: { email: { equals: email } },
      overrideAccess: true,
    }),
    payload.count({
      collection: 'access-requests',
      where: { and: [{ email: { equals: email } }, { status: { equals: 'pending' } }] },
      overrideAccess: true,
    }),
  ])

  // Quietly do nothing if they already have an account or a request waiting
  if (existingUser.totalDocs === 0 && existingRequest.totalDocs === 0) {
    await payload.create({
      collection: 'access-requests',
      data: { email, name, message, ip, status: 'pending', role: 'editor' },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    await notifyAccessRequest(payload, { email, name, message })
    await logSecurityEvent(payload, { event: 'access-requested', email, ip })
  }

  return Response.json(acknowledgement)
}
