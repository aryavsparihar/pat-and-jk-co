import type { Access, CollectionConfig, FieldAccess, Where } from 'payload'
import { APIError } from 'payload'

import { isMember, isStaff, superAdminOnly } from '../access/roles'
import { PARTNER_CATEGORIES } from '../members/categories'
import { decideApplication, type Decision } from '../members/decide'
import { APPLICATION_REFERENCE_PATTERN } from '../members/ids'

import { artistApplicationFields, partnerApplicationFields, progressFields } from './applicationFields'

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
 * (APP-7K3Q9X), and moves through its stages:
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
          throw new APIError(
            'Applications are given a reference by the server.',
            400,
            undefined,
            true,
          )
        }
        return data
      },
    ],
  },
  // One artist application and one partner application per person, at most
  indexes: [{ fields: ['member', 'type'], unique: true }],
  endpoints: [
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
