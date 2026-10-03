import type { Payload } from 'payload'

/**
 * Staff before members. Payload runs its auth strategies in order and stops at the first that
 * recognises someone, and it always adds its own staff strategy (the `payload-token` JWT) last,
 * after every collection's custom strategies, our member session among them. So a browser
 * carrying both cookies, as a member of staff who has also tried the artist form will, was taken
 * for the member: /admin refused, and staff API calls ran with a member's rights.
 *
 * Moving the JWT strategy to the front makes the staff session win wherever both are present.
 * With only a member cookie, it finds no token and passes on, so members are recognised as
 * before, and they still never reach /admin (src/access/memberGuard.ts, the members collection's
 * admin rule, and the gate in proxy.ts).
 */
export const putStaffSessionFirst = (payload: Payload): void => {
  const strategies = payload.authStrategies
  const jwt = strategies.findIndex((s) => s.name === 'local-jwt')
  if (jwt > 0) strategies.unshift(...strategies.splice(jwt, 1))
}
