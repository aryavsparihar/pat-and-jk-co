import type { PayloadRequest } from 'payload'
import { randomBytes } from 'node:crypto'

import { isCompanyEmail, normaliseEmail } from './constants'
import { logSecurityEvent } from './events'

type ApprovedRequest = {
  id: number | string
  email: string
  name?: string | null
  role?: ('editor' | 'super-admin') | null
}

/**
 * Turns an approved access request into a real account.
 *
 * The account is created with a random password nobody ever sees; the person then receives
 * Payload's "set your password" email and chooses their own. Until a super admin approves,
 * no account exists for that address, so the admin gate has nothing to send a code to.
 */
export const provisionApprovedUser = async ({
  request,
  req,
}: {
  request: ApprovedRequest
  req: PayloadRequest
}): Promise<void> => {
  const { payload } = req
  const email = normaliseEmail(request.email)

  if (!isCompanyEmail(email)) {
    payload.logger.warn(`Refused to create an account for ${email}: not a company address`)
    return
  }

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
    req,
  })

  if (existing.docs[0]) {
    // Already has an account — make sure it is usable again
    await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: { status: 'active' },
      overrideAccess: true,
      req,
    })
  } else {
    await payload.create({
      collection: 'users',
      data: {
        email,
        name: request.name || email.split('@')[0],
        roles: [request.role === 'super-admin' ? 'super-admin' : 'editor'],
        status: 'active',
        // Never used: the person sets their own password from the email below
        password: `${randomBytes(24).toString('base64url')}aA1!`,
      },
      overrideAccess: true,
      req,
    })
  }

  try {
    await payload.forgotPassword({
      collection: 'users',
      data: { email },
      disableEmail: false,
      req,
    })
  } catch (error) {
    payload.logger.error({ err: error, msg: `Could not send the password email to ${email}` })
  }

  await logSecurityEvent(payload, {
    event: 'access-approved',
    email,
    detail: `Approved by ${req.user?.email ?? 'unknown'}`,
    req,
  })
}
