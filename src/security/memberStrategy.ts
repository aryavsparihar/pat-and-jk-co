import type { AuthStrategy } from 'payload'

import { readMemberCookie, readSession } from './memberSession'

/**
 * How Payload recognises a member: by the session cookie, and nothing else. Members have no
 * password and no Payload token. Runs for any request carrying the cookie; a request without it
 * costs nothing. Payload would run this before its staff JWT strategy, so the order is changed
 * at start-up and a staff session wins when both cookies are present (src/security/strategyOrder.ts).
 */
export const memberSessionStrategy: AuthStrategy = {
  name: 'member-session',
  authenticate: async ({ headers, payload, canSetHeaders }) => {
    const value = readMemberCookie(headers)
    if (!value) return { user: null }

    const active = await readSession(payload, value)
    if (!active) return { user: null }

    return {
      user: { ...active.member, collection: 'members', _strategy: 'member-session' } as never,
      responseHeaders:
        canSetHeaders && active.refreshCookie
          ? new Headers({ 'Set-Cookie': active.refreshCookie })
          : undefined,
    }
  },
}
