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

/** The two member-ID slots, and the prefix each must carry */
export const MEMBER_ID_FIELDS = { artistId: 'AT', partnerId: 'PT' } as const

/**
 * A person who works with PJK as an artist, a partner, or both. One email, one sign-in, one
 * account: someone can hold an artist ID (AT000001) and a partner ID (PT000001) at once, each
 * issued when the application of that kind is approved. An auth collection of its own, entirely
 * separate from staff `users`:
 *
 *   - no passwords: the local strategy is off, and a member signs in with a one-time code only
 *     (src/app/(frontend)/next/members), recognised by the session cookie strategy
 *   - never the admin panel: `access.admin` is false, the member guard refuses it again, and the
 *     admin gate in proxy.ts stands in front of it regardless
 *   - a member may read their own record and change only their display name and telephone;
 *     everything that decides what they can do is staff-only, and the member IDs are no one's to edit
 *
 * Member IDs are issued on approval, from a database sequence per kind, inside the approval
 * transaction (src/members/decide.ts), and can never change afterwards. What someone has applied
 * for, and how far each application has got, lives on their applications.
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
    defaultColumns: ['email', 'artistId', 'partnerId', 'displayName', 'standing', 'createdAt'],
    description:
      'Artists and partners: one record per person, whatever they have applied for. They sign in at /collaborate/signin with a code sent to their email and never see this panel. Each member ID is issued when the application of that kind is approved.',
    listSearchableFields: ['email', 'artistId', 'partnerId', 'displayName'],
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
      type: 'row',
      fields: [
        {
          name: 'artistId',
          label: 'Artist ID',
          type: 'text',
          unique: true,
          index: true,
          access: { create: nobody, update: nobody },
          admin: {
            readOnly: true,
            width: '50%',
            description: 'Issued when an artist application is approved. Never changes.',
          },
        },
        {
          name: 'partnerId',
          label: 'Partner ID',
          type: 'text',
          unique: true,
          index: true,
          access: { create: nobody, update: nobody },
          admin: {
            readOnly: true,
            width: '50%',
            description: 'Issued when a partner application is approved. Never changes.',
          },
        },
      ],
    },
    {
      // Not "status": avoids any clash with Payload's own field names, here and in future
      name: 'standing',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Suspended: cannot sign in', value: 'suspended' },
      ],
      access: { update: staffOnlyField },
      admin: {
        position: 'sidebar',
        description: 'Suspending someone ends their sessions at once and stops them signing in.',
      },
    },
    {
      name: 'partnerCategory',
      type: 'select',
      options: PARTNER_CATEGORIES.map(({ value, label }) => ({ value, label })),
      access: { update: staffOnlyField },
      admin: { position: 'sidebar', condition: (data) => Boolean(data?.partnerId) },
    },
    {
      name: 'artistApprovedAt',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.artistId) },
    },
    {
      name: 'partnerApprovedAt',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.partnerId) },
    },
    { name: 'displayName', type: 'text', maxLength: 120 },
    { name: 'phone', type: 'text', maxLength: 20 },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation, context }) => {
        if (data.email !== undefined) data.email = normaliseEmail(data.email)

        // Each member ID is written once, by an approval, and never again
        for (const [field, prefix] of Object.entries(MEMBER_ID_FIELDS)) {
          const before = (originalDoc as Record<string, unknown> | undefined)?.[field] ?? null
          const after = data[field]
          if (after === undefined || after === before) continue
          if (before || operation === 'create' || context.issuingMemberId !== field) {
            throw new APIError('A member ID cannot be set or changed by hand.', 400, undefined, true)
          }
          if (!MEMBER_ID_PATTERN.test(String(after)) || !String(after).startsWith(prefix)) {
            throw new APIError('That is not a member ID of this kind.', 400, undefined, true)
          }
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

/** "AT000004 · PT000002": every member ID someone holds, for logs and lists */
export const memberIdsOf = (member: { artistId?: string | null; partnerId?: string | null }) =>
  [member.artistId, member.partnerId].filter(Boolean).join(' · ') || undefined
