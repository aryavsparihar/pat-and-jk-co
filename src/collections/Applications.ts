import type { Access, CollectionConfig, FieldAccess, Where } from 'payload'
import { publicError } from '@/utilities/publicError'
import { APIError } from 'payload'

import { isMember, isStaff, superAdminOnly } from '../access/roles'
import { PARTNER_CATEGORIES } from '../members/categories'
import { decideApplication, type Decision } from '../members/decide'
import { APPLICATION_REFERENCE_PATTERN } from '../members/ids'

import {
  artistApplicationFields,
  partnerApplicationFields,
  progressFields,
} from './applicationFields'

/** Stages an applicant may still edit their own application in */
export const EDITABLE_STAGES = ['draft', 'changes-requested'] as const

const readOwnOrStaff: Access = ({ req: { user } }) => {
  if (isStaff(user)) return true
  if (isMember(user)) return { member: { equals: user.id } }
  return false
}

const updateOwnWhileEditableOrStaff: Access = ({ req: { user } }) => {
  if (isStaff(user)) return true
  if (isMember(user)) {
    const own: Where = {
      and: [{ member: { equals: user.id } }, { stage: { in: [...EDITABLE_STAGES] } }],
    }
    return own
  }
  return false
}

const staffOnlyField: FieldAccess = ({ req: { user } }) => isStaff(user)
const nobody: FieldAccess = () => false

/**
 * One application per member per kind: how someone asks to work with PJK as an artist, or as a
 * partner. The same person may hold one of each, under one sign-in. It exists from the moment
 * an applicant verifies their email (as a draft), carries a reference they can quote
 * (A-7K3Q9X for an artist, PT-7K3Q9X for a partner), and moves through its stages:
 *
 *   draft → submitted → under review → approved
 *                                    → changes requested → submitted again
 *                                    → rejected
 *
 * Nobody moves the stage by editing it. Applicants submit (Phase 4); staff decide through
 * POST /api/applications/:id/decide, which runs the approval transaction and issues the member ID
 * (src/members/decide.ts). The form's own fields are added in Phase 4.
 */
export const Applications: CollectionConfig = {
  slug: 'applications',
  labels: { singular: 'Application', plural: 'Applications' },
  access: {
    create: () => false, // only the server, when an applicant verifies their email
    read: readOwnOrStaff,
    update: updateOwnWhileEditableOrStaff,
    delete: superAdminOnly,
  },
  admin: {
    group: 'Members',
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'member', 'type', 'stage', 'issuedId', 'submittedAt'],
    description:
      'Applications from artists and partners. Approving one issues the member ID and emails the applicant.',
    listSearchableFields: ['reference', 'issuedId'],
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'reference',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: nobody },
      admin: { readOnly: true, description: 'What the applicant quotes. Never changes.' },
    },
    {
      name: 'identityCode',
      label: 'Identity photo code',
      type: 'text',
      access: { update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        // Applications started before codes expired kept theirs here; new codes are only hashed
        condition: (data) => Boolean(data?.identityCode),
        description:
          'The code an earlier application was given for its identity photo. Codes are now given for ten minutes at a time and kept only as a hash.',
      },
    },
    {
      // HMAC of the code the artist has now, under KYC_BLIND_INDEX_KEY: enough to check a photo
      // against, useless to anyone reading the database. A new code replaces it
      name: 'identityCodeHash',
      type: 'text',
      access: { read: nobody, create: nobody, update: nobody },
      admin: { hidden: true },
    },
    {
      name: 'identityCodeIssuedAt',
      label: 'Identity code given',
      type: 'date',
      access: { update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => Boolean(data?.identityCodeIssuedAt),
      },
    },
    {
      name: 'identityCodeExpiresAt',
      label: 'Identity code valid until',
      type: 'date',
      access: { update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => Boolean(data?.identityCodeExpiresAt),
      },
    },
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
      access: { update: nobody },
      admin: { readOnly: true },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Artist', value: 'artist' },
        { label: 'Partner', value: 'partner' },
      ],
      access: { update: nobody },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      // Not "memberId": that would map to the same column as the `member` relationship
      name: 'issuedId',
      label: 'Member ID issued',
      type: 'text',
      index: true,
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'The AT or PT number this application earned on approval.',
      },
    },
    {
      // Approve / ask for changes / decline, with a note to the applicant
      name: 'decision',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/DecisionPanel#DecisionPanel' },
      },
    },
    {
      name: 'stage',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft: still being filled in', value: 'draft' },
        { label: 'Submitted', value: 'submitted' },
        { label: 'Under review', value: 'under-review' },
        { label: 'Changes requested', value: 'changes-requested' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      // Moved only by the server: a submission, or a staff decision through /decide
      access: { update: nobody },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'partnerCategory',
      type: 'select',
      options: PARTNER_CATEGORIES.map(({ value, label }) => ({ value, label })),
      admin: { position: 'sidebar', condition: (data) => data?.type === 'partner' },
    },
    ...artistApplicationFields,
    ...partnerApplicationFields,
    ...progressFields,
    {
      name: 'decisionNote',
      label: 'Note to the applicant',
      type: 'textarea',
      access: { update: nobody },
      admin: {
        readOnly: true,
        description: 'Sent with a rejection or a request for changes; the applicant sees it.',
      },
    },
    {
      name: 'staffNotes',
      label: 'Notes for staff',
      type: 'textarea',
      access: { read: staffOnlyField, create: staffOnlyField, update: staffOnlyField },
      admin: { description: 'Never shown to the applicant.' },
    },
    {
      name: 'submittedAt',
      type: 'date',
      access: { update: nobody },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'decidedAt',
      type: 'date',
      access: { update: nobody },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'reapplyFrom',
      label: 'May apply again from',
      type: 'date',
      access: { update: nobody },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Set when the application is declined, from the wait in Site settings → Applications. "Allow them to apply again now" ends it early.',
      },
    },
    {
      name: 'rounds',
      label: 'Earlier rounds',
      type: 'array',
      access: { read: staffOnlyField, update: nobody },
      admin: {
        readOnly: true,
        initCollapsed: true,
        description: 'Each earlier decision, kept when the applicant applied again.',
      },
      fields: [
        { name: 'decision', type: 'text' },
        { name: 'submittedAt', type: 'date' },
        { name: 'decidedAt', type: 'date' },
        { name: 'note', type: 'textarea' },
      ],
    },
    {
      name: 'decidedBy',
      type: 'relationship',
      relationTo: 'users',
      access: { read: staffOnlyField, update: nobody },
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create' && !APPLICATION_REFERENCE_PATTERN.test(String(data.reference))) {
          throw publicError('Applications are given a reference by the server.', 400)
        }
        return data
      },
    ],
  },
  // One artist application and one partner application per person, at most
  indexes: [{ fields: ['member', 'type'], unique: true }],
  endpoints: [
    {
      // POST /api/applications/:id/allow-reapply. Staff only; logged
      path: '/:id/allow-reapply',
      method: 'post',
      handler: async (req) => {
        if (!isStaff(req.user)) return Response.json({ message: 'Not allowed.' }, { status: 403 })
        const { allowReapplyNow } = await import('../members/reapply')
        try {
          await allowReapplyNow(req.payload, {
            applicationId: Number(req.routeParams?.id),
            actor: req.user,
          })
          return Response.json({ ok: true })
        } catch (error) {
          const status = error instanceof APIError ? error.status : 500
          return Response.json(
            { message: error instanceof APIError ? error.message : 'That could not be done.' },
            { status },
          )
        }
      },
    },
    {
      // POST /api/applications/:id/decide  { decision, note }. Staff only
      path: '/:id/decide',
      method: 'post',
      handler: async (req) => {
        if (!isStaff(req.user)) {
          return Response.json({ message: 'Only staff can decide applications.' }, { status: 403 })
        }
        const id = Number(req.routeParams?.id)
        const body = (await req.json?.().catch(() => ({}))) as { decision?: string; note?: string }
        const decision = body?.decision as Decision
        if (
          !Number.isSafeInteger(id) ||
          !['approve', 'reject', 'request-changes'].includes(decision)
        ) {
          return Response.json(
            { message: 'Choose approve, reject or request-changes.' },
            { status: 400 },
          )
        }
        try {
          const result = await decideApplication(req.payload, {
            applicationId: id,
            decision,
            note: body.note,
            actor: req.user,
          })
          return Response.json({
            stage: result.application.stage,
            memberId: result.application.issuedId ?? null,
          })
        } catch (error) {
          const status = error instanceof APIError ? error.status : 500
          const message =
            error instanceof APIError ? error.message : 'The decision could not be saved.'
          if (status === 500)
            req.payload.logger.error({ err: error, msg: 'Application decision failed' })
          return Response.json({ message }, { status })
        }
      },
    },
  ],
  timestamps: true,
}
