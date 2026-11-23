/**
 * Which of their accounts a member is looking at, when one email holds both an Artist ID and a
 * Trade Partner ID (the founder's request of 22 November 2026). It is only a preference, kept in
 * a cookie: what either account may do is decided by the member's IDs, never by this.
 */

export type AccountView = 'artist' | 'partner'

export const VIEW_COOKIE = 'pjk_account_view'

type Holder = { artistId?: string | null; partnerId?: string | null }

export const isAccountView = (value: unknown): value is AccountView =>
  value === 'artist' || value === 'partner'

export const holds = (member: Holder, view: AccountView): boolean =>
  Boolean(view === 'artist' ? member.artistId : member.partnerId)

/** The account to show: the one asked for if they hold it, else the artist one, else partner */
export const chooseView = (member: Holder, wanted: unknown): AccountView | null => {
  if (isAccountView(wanted) && holds(member, wanted)) return wanted
  if (member.artistId) return 'artist'
  if (member.partnerId) return 'partner'
  return null
}
