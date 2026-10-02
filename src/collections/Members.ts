import type { Access, CollectionConfig, FieldAccess } from 'payload'
import { APIError } from 'payload'

import { isMember, isStaff, superAdminOnly } from '../access/roles'
import { PARTNER_CATEGORIES } from '../members/categories'
import { MEMBER_ID_PATTERN } from '../members/ids'
import { normaliseEmail } from '../security/constants'
import { memberSessionStrategy } from '../security/memberStrategy'

/** Staff see everyone; a member sees only their own record; nobody else sees any. */
const readOwnOrStaff: Access = ({ req: { user } }) => {
  if (isStaff(user)) return true
  if (isMember(user)) return { id: { equals: user.id } }
  return false
}

const staffOnlyField: FieldAccess = ({ req: { user } }) => isStaff(user)
const nobody: FieldAccess = () => false

/**
 * Artists and partners. An auth collection of their own, entirely separate from staff `users`:
 *
 *   - no passwords: the local strategy is off, and a member signs in with a one-time code only
 *     (src/app/(frontend)/next/members), recognised by the session cookie strategy
 *   - never the admin panel: `access.admin` is false, the member guard refuses it again, and the
 *     admin gate in proxy.ts stands in front of it regardless
 *   - a member may read their own record and change only their display name and telephone;
 *     everything that decides what they can do is staff-only, and the member ID is no one's to edit
 *
 * The member ID (AT000001 / PT000001) is issued on approval, from a database sequence, inside the
 * approval transaction (src/members/decide.ts), and can never change afterwards.
 */
export const Members: CollectionConfig = {
  slug: 'members',
  labels: { singular: 'Member', plural: 'Members' },
  auth: {
    disableLocalStrategy: true,
    strategies: [memberSessionStrategy],
  },
  access: {
    admin: () => false,
    create: () => false, // only the server, when an applicant verifies their address
    read: readOwnOrStaff,
    update: ({ req: { user } }) => {
      if (isStaff(user)) return true
      if (isMember(user)) return { id: { equals: user.id } }
      return false
    },
    delete: superAdminOnly,
  },
  admin: {
    group: 'Members',
    useAsTitle: 'email',
    defaultColumns: ['memberId', 'email', 'displayName', 'type', 'standing', 'createdAt'],
    description:
      'Artists and partners. They sign in at /collaborate/signin with a code sent to their email; they never see this panel. A member ID is issued when their application is approved.',
    listSearchableFields: ['email', 'memberId', 'displayName'],
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
      access: { update: staffOnlyField },
    },
    {
      name: 'memberId',
      label: 'Member ID',
      type: 'text',
      unique: true,
      index: true,
      access: { create: nobody, update: nobody },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Issued on approval. Never changes.',
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Artist', value: 'artist' },
        { label: 'Partner', value: 'partner' },
      ],
      access: { update: staffOnlyField },
      admin: { position: 'sidebar' },
    },
    {
      // Not "status": avoids any clash with Payload's own field names, here and in future
      name: 'standing',
      type: 'select',
      required: true,
      defaultValue: 'applicant',
      options: [
        { label: 'Applicant: application not yet approved', value: 'applicant' },
        { label: 'Approved member', value: 'approved' },
        { label: 'Suspended: cannot sign in', value: 'suspended' },
      ],
      access: { update: staffOnlyField },
      admin: {
        position: 'sidebar',
        description: 'Suspending a member ends their sessions at once and stops them signing in.',
      },
    },
    {
      name: 'partnerCategory',
      type: 'select',
      options: PARTNER_CATEGORIES.map(({ value, label }) => ({ value, label })),
      access: { update: staffOnlyField },
      admin: { position: 'sidebar', condition: (data) => data?.type === 'partner' },
    },
    {
      name: 'approvedAt',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: { position: 'sidebar', readOnly: true },
    },
    { name: 'displayName', type: 'text', maxLength: 120 },
    { name: 'phone', type: 'text', maxLength: 20 },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation, context }) => {
        if (data.email !== undefined) data.email = normaliseEmail(data.email)

        // The member ID is written once, by the approval, and never again
        const before = originalDoc?.memberId ?? null
        if (data.memberId !== undefined && data.memberId !== before) {
          if (before || !context.issuingMemberId) {
            throw new APIError('A member ID cannot be changed.', 400, undefined, true)
          }
          if (!MEMBER_ID_PATTERN.test(String(data.memberId))) {
            throw new APIError('That is not a member ID.', 400, undefined, true)
          }
        }
        if (operation === 'create' && data.memberId && !context.issuingMemberId) {
          throw new APIError('A member ID is issued on approval.', 400, undefined, true)
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        // Suspension takes effect at once: every session ends
        if (
          operation === 'update' &&
          doc.standing === 'suspended' &&
          previousDoc?.standing !== 'suspended'
        ) {
          const { revokeAllSessions } = await import('../security/memberSession')
          await revokeAllSessions(req.payload, doc.id, 'suspended')
        }
        return doc
      },
    ],
  },
  timestamps: true,
}
