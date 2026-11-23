import { type Role, roleOpen } from './idStanding'

/**
 * Which of their accounts a member is looking at, when one email holds both an Artist ID and a
 * Trade Partner ID (the founder's request of 22 November 2026). It is only a preference, kept in
 * a cookie: what either account may do is decided by the member's IDs, never by this.
 */

export type AccountView = 'artist' | 'partner'

export const VIEW_COOKIE = 'pjk_account_view'

type Holder = Parameters<typeof roleOpen>[0]

export const isAccountView = (value: unknown): value is AccountView =>
  value === 'artist' || value === 'partner'

/** They hold this ID and its account is open (not suspended or removed) */
export const holds = (member: Holder, view: AccountView): boolean => roleOpen(member, view as Role)

/** The account to show: the one asked for if they hold it, else the artist one, else partner */
export const chooseView = (member: Holder, wanted: unknown): AccountView | null => {
  if (isAccountView(wanted) && holds(member, wanted)) return wanted
  if (holds(member, 'artist')) return 'artist'
  if (holds(member, 'partner')) return 'partner'
  return null
}
