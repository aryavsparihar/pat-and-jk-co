/**
 * Away from the keyboard: a browser left untouched for fifteen minutes while someone is signed in
 * is signed out. A minute before that a dialog asks whether to stay; unanswered, the minute runs
 * out and the session ends.
 *
 * Why the browser has to do this. Both sessions already end by themselves when they are not used —
 * a member's a day after its last use, staff's thirty minutes (src/security/constants.ts,
 * src/collections/Users) — but "used" means a request, and an open tab keeps making them: the
 * site's header asks /next/session every few minutes, and the admin panel refreshes its own token
 * while it is open. So a tab left open on a borrowed or shared screen stayed signed in for as long
 * as it was open. Only the browser can tell that nobody is there.
 *
 * What ends is the session itself, not only this page: the member's session is revoked in the
 * database (/next/members/sign-out) or the staff cookie cleared by Payload's own logout, so a
 * cookie copied out of the browser beforehand is no use either. It is a convenience rather than a
 * boundary, though — the limits that do not depend on the browser are the sessions' own.
 *
 * This file is the clock's arithmetic and nothing else, so a page rendered on the server can take
 * AFK_LIMIT_MINUTES from it for its wording. The watching is in useAfkSignOut.ts, and the dialogs
 * in IdleSignOut.tsx here and in src/components/admin.
 */

/** Untouched for this long and the session ends */
export const AFK_LIMIT_MS = 15 * 60_000

/** The dialog appears this long before the limit */
const WARNING_MS = 60_000

/** How long a tab may sleep between checks while nothing is close to running out */
const MAX_SLEEP_MS = 30_000

/** The limit, for the wording of the dialog and of the sign-in page */
export const AFK_LIMIT_MINUTES = AFK_LIMIT_MS / 60_000

export type AfkState =
  /** Somebody has been here recently enough; look again in checkInMs */
  | { checkInMs: number; phase: 'active' }
  /** The dialog is up and counting down */
  | { checkInMs: number; phase: 'warning'; secondsLeft: number }
  /** The limit has passed: end the session */
  | { phase: 'over' }

/**
 * What a tab should do, given how long it has been since anything was touched. Pure, so the
 * timings are checked without a browser (tests/int/units.int.spec.ts).
 */
export const afkState = (idleMs: number, limitMs: number = AFK_LIMIT_MS): AfkState => {
  const left = limitMs - idleMs
  if (left <= 0) return { phase: 'over' }
  // Never more than half of a shortened limit, so a test that counts in seconds still sees the
  // dialog for some of them
  const warning = Math.min(WARNING_MS, limitMs / 2)
  if (left <= warning) {
    return {
      checkInMs: Math.min(1000, left),
      phase: 'warning',
      secondsLeft: Math.ceil(left / 1000),
    }
  }
  return { checkInMs: Math.min(left - warning, MAX_SLEEP_MS), phase: 'active' }
}
