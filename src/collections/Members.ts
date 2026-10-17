import type { Access, CollectionConfig, Field, FieldAccess } from 'payload'
import { publicError } from '@/utilities/publicError'

import { isKycReviewer, isMember, isStaff, isSuperAdmin } from '../access/roles'
import { PARTNER_CATEGORIES } from '../members/categories'
import { MEDIUMS } from '../members/forms/schemas'
import { publishedFields, reviewGroup } from '../members/reviewFields'
import { addressFields } from './applicationFields'
import { MEMBER_ID_PATTERN } from '../members/ids'
import { normaliseEmail } from '../security/constants'
import { memberSessionStrategy } from '../security/memberStrategy'
import { refuse } from '../security/refused'

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
    // Never outright: a member's applications, sessions, pictures, KYC and works all belong to
    // them, so the database refuses to remove the row, and the admin could only say "Something
    // went wrong". Someone is deleted by erasing their personal details and keeping the record
    delete: () => false,
  },
  admin: {
    group: 'Members',
    // "Deleted artist (AT000012)" once someone is deleted, their email until then
    useAsTitle: 'title',
    defaultColumns: ['title', 'artistId', 'partnerId', 'displayName', 'standing', 'createdAt'],
    description:
      'Artists and partners: one record per person, whatever they have applied for. They sign in at /collaborate/signin with a code sent to their email and never see this panel. Each member ID is issued when the application of that kind is approved.',
    listSearchableFields: ['title', 'email', 'artistId', 'partnerId', 'displayName'],
  },
  defaultSort: '-createdAt',
  fields: [
    {
      // What the admin shows wherever someone is linked: their email, or the placeholder once
      // they are deleted. Worked out on every save (beforeChange), never typed
      name: 'title',
      type: 'text',
      index: true,
      admin: { hidden: true },
    },
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      index: true,
      // Never edited by hand: the member changes it with a code to the new address, or a KYC
      // reviewer changes it after an identity check with "Change the email address" (logged, and
      // both addresses told). A plain edit here would hand the account to whoever typed it
      access: { update: () => false },
      admin: { readOnly: true },
    },
    {
      // Delete and erase: super admins only (src/people/erase.ts)
      name: 'erase',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/ErasePanel#ErasePanel' },
      },
    },
    {
      // Set when someone is deleted: when, by whom, why, at whose request, and what the law
      // made us keep. Written only by the erasure, never by hand
      name: 'erasure',
      label: 'Deleted',
      type: 'group',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, condition: (data) => Boolean(data?.erasure?.at) },
      fields: [
        { name: 'at', label: 'Deleted on', type: 'date' },
        { name: 'by', label: 'Deleted by', type: 'relationship', relationTo: 'users' },
        {
          name: 'source',
          type: 'select',
          options: [
            { label: 'By staff', value: 'admin' },
            { label: 'At their own request', value: 'data-request' },
          ],
        },
        { name: 'reason', type: 'textarea' },
        { name: 'kept', label: 'Kept because the law requires it', type: 'textarea' },
      ],
    },
    {
      // A member's own request to be deleted, from their account (/next/members/data-request)
      name: 'deletionRequest',
      label: 'Asked to be deleted',
      type: 'group',
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        condition: (data) => Boolean(data?.deletionRequest?.requestedAt),
      },
      fields: [{ name: 'requestedAt', label: 'Asked on', type: 'date' }],
    },
    {
      name: 'emailRecovery',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/EmailRecoveryPanel#EmailRecoveryPanel' },
      },
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
        // Only ever set by the erasure, which also empties the record
        { label: 'Deleted: details erased', value: 'erased' },
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
    {
      // Contact details: changed by the member at once, never shown to the public
      name: 'contactAddress',
      label: 'Postal address',
      type: 'group',
      admin: { condition: (data) => Boolean(data?.artistId || data?.partnerId) },
      fields: addressFields(),
    },

    // The artist's works live in one Google Drive folder of theirs, a folder per work inside it
    // (docs/ADMIN_GUIDE.md, "Artists' works"). Set by the artist from their account
    // (/next/members/portal/works-folder), checked to be a Drive folder link; staff may correct it
    {
      name: 'worksFolder',
      label: 'Works folder (Google Drive)',
      type: 'text',
      maxLength: 200,
      access: { update: staffOnlyField },
      admin: {
        position: 'sidebar',
        condition: (data) => Boolean(data?.artistId),
        components: { Field: '@/components/admin/DriveFolderField#DriveFolderField' },
      },
    },
    {
      name: 'worksFolderUpdatedAt',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: { hidden: true },
    },

    // The artist's public profile (Phase 6 portal). Members edit `profile` from their account;
    // staff approve it, which publishes `publicProfile`, the only version the public sees.
    {
      name: 'profileReviewActions',
      type: 'ui',
      admin: {
        position: 'sidebar',
        condition: (data) => Boolean(data?.artistId),
        components: { Field: '@/components/admin/ReviewPanel#ReviewPanel' },
      },
    },
    {
      ...reviewGroup('profileReview', 'Profile review'),
      admin: { readOnly: true, condition: (data) => Boolean(data?.artistId) },
    } as Field,
    {
      name: 'profile',
      label: 'Profile (working copy)',
      type: 'group',
      access: { update: staffOnlyField },
      admin: { condition: (data) => Boolean(data?.artistId) },
      fields: [
        { name: 'displayName', label: 'Name shown', type: 'text', maxLength: 120 },
        { name: 'bio', label: 'Biography', type: 'textarea', maxLength: 2000 },
        { name: 'statement', label: 'Artist statement', type: 'textarea', maxLength: 2000 },
        {
          name: 'links',
          type: 'array',
          maxRows: 5,
          fields: [
            { name: 'label', type: 'text', maxLength: 60 },
            { name: 'url', type: 'text', maxLength: 300 },
          ],
        },
        { name: 'portrait', type: 'upload', relationTo: 'portfolio-images' },
        {
          name: 'mediums',
          type: 'select',
          hasMany: true,
          options: MEDIUMS.map(({ value, label }) => ({ value, label })),
        },
        {
          name: 'exhibitions',
          type: 'array',
          maxRows: 30,
          fields: [
            { name: 'title', type: 'text', maxLength: 160 },
            { name: 'venue', type: 'text', maxLength: 160 },
            { name: 'year', type: 'number', min: 1900, max: 2100 },
          ],
        },
      ],
    },
    ...publishedFields('publicProfile'),
    {
      // A change of email address waiting for its code (src/members/account.ts). Hidden: the
      // pending address is shown to nobody until it is confirmed
      name: 'emailChange',
      type: 'group',
      access: { read: nobody, create: nobody, update: nobody },
      admin: { hidden: true },
      fields: [
        { name: 'pendingEmail', type: 'email' },
        { name: 'challengeId', type: 'number' },
        { name: 'requestedAt', type: 'date' },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation, context }) => {
        // A deleted person's record never changes again, and only the erasure deletes anyone
        if (!context.erasing) {
          if (originalDoc?.standing === 'erased') {
            throw publicError('This person has been deleted; their record cannot change.', 409)
          }
          if (data.standing === 'erased') {
            throw publicError('Use "Delete this person" to delete someone.', 400)
          }
        }
        if (data.email !== undefined) data.email = normaliseEmail(data.email)
        const standing = data.standing ?? originalDoc?.standing
        const email = data.email ?? originalDoc?.email
        data.title = standing === 'erased' ? (data.displayName ?? originalDoc?.displayName) : email

        // Each member ID is written once, by an approval, and never again
        for (const [field, prefix] of Object.entries(MEMBER_ID_FIELDS)) {
          const before = (originalDoc as Record<string, unknown> | undefined)?.[field] ?? null
          const after = data[field]
          if (after === undefined || after === before) continue
          if (before || operation === 'create' || context.issuingMemberId !== field) {
            throw publicError('A member ID cannot be set or changed by hand.', 400)
          }
          if (!MEMBER_ID_PATTERN.test(String(after)) || !String(after).startsWith(prefix)) {
            throw publicError('That is not a member ID of this kind.', 400)
          }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation, context }) => {
        if (operation === 'update' && !context.erasing && doc.standing !== previousDoc?.standing) {
          const { logSecurityEvent } = await import('../security/events')
          const actor = req.user as { id?: number; email?: string; collection?: string } | null
          await logSecurityEvent(req.payload, {
            event: 'member-standing-changed',
            email: doc.email,
            subject: memberIdsOf(doc),
            actor: actor?.collection === 'users' ? (actor.id ?? null) : null,
            detail: `${previousDoc?.standing} → ${doc.standing}${actor?.email ? ` by ${actor.email}` : ''}`,
            req,
          })
        }
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
  endpoints: [
    {
      // GET /api/members/:id/erase: what deleting them would do. POST { confirm, reason }: do it.
      // Super admins only; logged (src/people/erase.ts)
      path: '/:id/erase',
      method: 'get',
      handler: async (req) => {
        if (!isSuperAdmin(req.user)) return refuse(req, 'Only a super admin can do this.')
        const { memberErasurePreview } = await import('../people/erase')
        const preview = await memberErasurePreview(req.payload, Number(req.routeParams?.id))
        if (!preview) return Response.json({ message: 'There is no such member.' }, { status: 404 })
        return Response.json(preview)
      },
    },
    {
      path: '/:id/erase',
      method: 'post',
      handler: async (req) => {
        if (!isSuperAdmin(req.user)) return refuse(req, 'Only a super admin can do this.')
        const body = (await req.json?.().catch(() => ({}))) as { confirm?: string; reason?: string }
        const { ErasureError, eraseMember } = await import('../people/erase')
        try {
          const result = await eraseMember(req.payload, {
            memberId: Number(req.routeParams?.id),
            actor: req.user as never,
            confirm: body?.confirm,
            reason: body?.reason,
          })
          return Response.json({ ok: true, ...result })
        } catch (error) {
          if (error instanceof ErasureError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Deleting a member failed' })
          return Response.json(
            {
              message:
                'Deleting them did not finish. Please try again: it carries on from where it stopped.',
            },
            { status: 500 },
          )
        }
      },
    },
    {
      // POST /api/members/:id/change-email  { email, reason }. KYC reviewers only; logged
      path: '/:id/change-email',
      method: 'post',
      handler: async (req) => {
        if (!isKycReviewer(req.user)) {
          return refuse(req, 'Only a KYC reviewer can do this.')
        }
        const body = (await req.json?.().catch(() => ({}))) as { email?: string; reason?: string }
        const { changeEmailByStaff } = await import('../members/account')
        const { PortalError } = await import('../members/artworks')
        try {
          const result = await changeEmailByStaff(req.payload, {
            memberId: Number(req.routeParams?.id),
            email: body?.email,
            reason: body?.reason,
            actor: req.user,
          })
          return Response.json({ ok: true, ...result })
        } catch (error) {
          if (error instanceof PortalError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Staff email change failed' })
          return Response.json({ message: 'The address could not be changed.' }, { status: 500 })
        }
      },
    },
    {
      // POST /api/{collection}/:id/profile-review  { decision: 'approve' | 'request-changes', note }. Staff only
      path: '/:id/profile-review',
      method: 'post',
      handler: async (req) => {
        if (!isStaff(req.user)) return refuse(req, 'Not allowed.')
        const body = (await req.json?.().catch(() => ({}))) as { decision?: string; note?: string }
        if (body?.decision !== 'approve' && body?.decision !== 'request-changes') {
          return Response.json({ message: 'Approve, or ask for changes?' }, { status: 400 })
        }
        const { PortalError, decideProfile } = await import('../members/artworks')
        try {
          await decideProfile(req.payload, {
            memberId: Number(req.routeParams?.id),
            decision: body.decision,
            note: body.note,
            actor: req.user,
          })
          return Response.json({ ok: true })
        } catch (error) {
          if (error instanceof PortalError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Review decision failed' })
          return Response.json({ message: 'The decision could not be saved.' }, { status: 500 })
        }
      },
    },
  ],
  timestamps: true,
}

/** "AT000004 · PT000002": every member ID someone holds, for logs and lists */
export const memberIdsOf = (member: { artistId?: string | null; partnerId?: string | null }) =>
  [member.artistId, member.partnerId].filter(Boolean).join(' · ') || undefined
