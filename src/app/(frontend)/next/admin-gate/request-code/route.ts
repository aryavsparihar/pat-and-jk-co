import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  clientIp,
  isCompanyEmail,
  normaliseEmail,
  OTP_MAX_PER_EMAIL_PER_HOUR,
  OTP_MAX_PER_IP_PER_HOUR,
} from '@/security/constants'
import { issueChallenge } from '@/security/challenges'
import { sendSignInCode } from '@/security/email'
import { logSecurityEvent } from '@/security/events'

export const dynamic = 'force-dynamic'

/**
 * Step one of admin sign-in: email a one-time code to a company mailbox.
 *
 * The reply is deliberately the same whether or not an account exists, so this cannot be
 * used to discover who works here. A challenge row is always written; only an address with
 * an active account actually receives a code.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const ip = clientIp(request.headers)

  let email = ''
  try {
    const body = (await request.json()) as { email?: string }
    email = normaliseEmail(body.email)
  } catch {
    return Response.json({ message: 'Enter your work email address.' }, { status: 400 })
  }

  if (!isCompanyEmail(email)) {
    await logSecurityEvent(payload, {
      event: 'code-requested',
      email,
      ip,
      detail: 'rejected domain',
    })
    return Response.json(
      { message: 'Use your PAT and J.K. Co. email address to sign in.' },
      { status: 400 },
    )
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [byEmail, byIp] = await Promise.all([
    payload.count({
      collection: 'login-challenges',
      where: {
        and: [
          { email: { equals: email } },
          { audience: { equals: 'staff' } },
          { createdAt: { greater_than: since } },
        ],
      },
      overrideAccess: true,
    }),
    payload.count({
      collection: 'login-challenges',
      where: {
        and: [
          { ip: { equals: ip } },
          { audience: { equals: 'staff' } },
          { createdAt: { greater_than: since } },
        ],
      },
      overrideAccess: true,
    }),
  ])

  if (
    byEmail.totalDocs >= OTP_MAX_PER_EMAIL_PER_HOUR ||
    byIp.totalDocs >= OTP_MAX_PER_IP_PER_HOUR
  ) {
    await logSecurityEvent(payload, { event: 'code-rate-limited', email, ip })
    return Response.json(
      { message: 'Too many codes requested. Try again in an hour.' },
      { status: 429 },
    )
  }

  // Only an active account gets a real code; everyone else gets an identical-looking reply
  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  const user = users.docs[0]
  const deliverable = Boolean(user && user.status === 'active')

  const challenge = await issueChallenge(payload, { email, ip, audience: 'staff', deliverable })
  const { code } = challenge

  await logSecurityEvent(payload, {
    event: 'code-requested',
    email,
    ip,
    detail: deliverable ? 'code sent' : user ? `account ${user.status}` : 'no account',
  })

  if (deliverable) {
    const sent = await sendSignInCode(payload, { email, code })
    if (!sent) {
      return Response.json(
        { message: 'We could not send the code right now. Please tell the technical director.' },
        { status: 503 },
      )
    }
    await logSecurityEvent(payload, { event: 'code-sent', email, ip })
  }

  return Response.json({
    challengeId: challenge.id,
    message: `If ${email} has an approved account, a sign-in code is on its way.`,
  })
}
