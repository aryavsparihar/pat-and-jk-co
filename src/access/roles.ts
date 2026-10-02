import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'

/**
 * Who is staff.
 *
 * Payload sets `req.user` for anyone signed in through *any* auth collection, and stamps it with
 * the collection it came from. Staff are the `users` collection; members (artists and partners)
 * will be another. So "is someone signed in" is never the question for an access decision — "is
 * this a staff account" is. Every check below goes through `isStaff`.
 */
export const STAFF_COLLECTION = 'users'

type MaybeUser = (Partial<User> & { collection?: string }) | null | undefined

export const isStaff = (user: unknown): user is User & { collection: typeof STAFF_COLLECTION } =>
  Boolean(user) && (user as { collection?: string }).collection === STAFF_COLLECTION

/**
 * Two staff roles:
 * - super-admin: the technical owner. Sees every brand (tenant), manages users and domains.
 * - editor: brand staff. Edits content only for the brands assigned to them (enforced by the multi-tenant plugin).
 */
export const isSuperAdmin = (user?: MaybeUser): boolean =>
  isStaff(user) && Boolean(user.roles?.includes('super-admin'))

export const superAdminOnly: Access = ({ req: { user } }) => isSuperAdmin(user)

export const superAdminOnlyField: FieldAccess = ({ req: { user } }) => isSuperAdmin(user)

export const superAdminOrSelf: Access = ({ req: { user } }) => {
  if (!isStaff(user)) return false
  if (isSuperAdmin(user)) return true
  return { id: { equals: user.id } }
}
