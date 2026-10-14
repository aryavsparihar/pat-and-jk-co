import type { Payload } from 'payload'

import type { MemberSession } from '@/payload-types'

import { reply } from './http'

/**
 * Sensitive actions (identity details and documents, payout details, changing the email address,
 * asking for one's data) need a sign-in within the last 30 minutes, not just a valid session: a
 * session left open on a shared computer, or a stolen cookie, is not enough on its own. Past that,
 * the member is asked for a fresh code to their own address (/next/members/step-up, then
 * /next/members/step-up/confirm), and the action goes ahead.
 */

export const RECENT_SIGN_IN_SECONDS = 30 * 60

export const recentlyConfirmed = (
  session: Pick<MemberSession, 'confirmedAt' | 'createdAt'>,
  now = Date.now(),
) => {
  const at = new Date(session.confirmedAt ?? session.createdAt).getTime()
  return now - at <= RECENT_SIGN_IN_SECONDS * 1000
}

/** Null when the session was confirmed recently enough; otherwise the reply that asks for a code */
export const requireRecentSignIn = (session: MemberSession): Response | null =>
  recentlyConfirmed(session)
    ? null
    : reply(
        {
          message: 'For your security, please confirm it is you. We will email you a code.',
          stepUp: true,
        },
        { status: 403 },
      )

/** Marks the session as confirmed now: after a fresh code */
export const confirmSession = async (payload: Payload, session: MemberSession) => {
  await payload.update({
    collection: 'member-sessions',
    id: session.id,
    data: { confirmedAt: new Date().toISOString() },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
}
