import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'

/**
 * Two roles:
 * - super-admin: the technical owner. Sees every brand (tenant), manages users and domains.
 * - editor: brand staff. Edits content only for the brands assigned to them (enforced by the multi-tenant plugin).
 */
export const isSuperAdmin = (user?: Partial<User> | null): boolean =>
  Boolean(user?.roles?.includes('super-admin'))

export const superAdminOnly: Access = ({ req: { user } }) => isSuperAdmin(user)

export const superAdminOnlyField: FieldAccess = ({ req: { user } }) => isSuperAdmin(user)

export const superAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  return { id: { equals: user.id } }
}
