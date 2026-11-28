import type {
  Access,
  CollectionConfig,
  Endpoint,
  Field,
  FieldAccess,
  PayloadRequest,
  Where,
} from 'payload'
import type { User } from '../payload-types'
import { publicError } from '@/utilities/publicError'
import { APIError } from 'payload'

import { isMember, isStaff, superAdminOnly } from '../access/roles'
import { PARTNER_CATEGORIES } from '../members/categories'
import { decideApplication, DECISIONS, type Decision } from '../members/decide'
import { APPLICATION_REFERENCE_PATTERN } from '../members/ids'
import { canMove, type Stage } from '../members/stages'

import {
  artistApplicationFields,
  consentRecordFields,
  curatorApplicationFields,
  partnerApplicationFields,
  progressFields,
} from './applicationFields'
import { refuse } from '../security/refused'

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
 * What the applicant wrote is theirs alone to change, and only while the application is open to
 * them (the collection's update rule). Staff never rewrite it, in the admin or through the API,
 * so a sent application stays exactly as it was sent. The server's own writes (overrideAccess)
 * are the only exception: the stage, the consent record, the declarations agreed to.
 */
const applicantOnly: FieldAccess = ({ req: { user } }) => isMember(user)
const writtenByApplicant = (field: Field): Field =>
  'name' in field && !('access' in field && field.access?.update)
    ? ({
        ...field,
        access: { ...(field as { access?: object }).access, update: applicantOnly },
      } as Field)
    : field

/** What went wrong, as staff should read it: a known refusal in its words, anything else plainly */
const failed = (req: PayloadRequest, error: unknown, what: string) => {
  const status = error instanceof APIError ? error.status : 500
  if (status === 500) req.payload.logger.error({ err: error, msg: `${what} failed` })
  return Response.json(
    { message: error instanceof APIError ? error.message : 'That could not be done.' },
    { status },
  )
}

/**
 * The Curators screen's actions (src/curators/admin.ts), staff only: send one of the two letters
 * as edited, put a curator on a project, add a team note, and open their portfolio or CV.
 */
const curatorEndpoints = (): Endpoint[] => {
  const action =
    (
      run: (req: PayloadRequest, id: number, body: Record<string, unknown>) => Promise<unknown>,
      what: string,
    ) =>
    async (req: PayloadRequest) => {
      if (!isStaff(req.user)) return refuse(req, 'Only staff can do that.')
      const body = ((await req.json?.().catch(() => ({}))) ?? {}) as Record<string, unknown>
      try {
        await run(req, Number(req.routeParams?.id), body)
        return Response.json({ ok: true })
      } catch (error) {
        return failed(req, error, what)
      }
    }
  return [
    {
      // POST /api/applications/:id/curator-email  { kind: 'talk' | 'decline', subject, body }
      path: '/:id/curator-email',
      method: 'post',
      handler: action(async (req, id, body) => {
        const { sendFromCuratorsScreen } = await import('../curators/admin')
        await sendFromCuratorsScreen(req.payload, req.user as User, {
          id,
          kind: body.kind as 'talk' | 'decline',
          subject: String(body.subject ?? ''),
          body: String(body.body ?? ''),
        })
      }, 'Curator email'),
    },
    {
      // POST /api/applications/:id/curator-project  { project }
      path: '/:id/curator-project',
      method: 'post',
      handler: action(async (req, id, body) => {
        const { setCuratorProject } = await import('../curators/admin')
        await setCuratorProject(req.payload, req.user as User, {
          id,
          project: String(body.project ?? ''),
        })
      }, 'Curator project'),
    },
    {
      // POST /api/applications/:id/curator-note  { note }
      path: '/:id/curator-note',
      method: 'post',
      handler: action(async (req, id, body) => {
        const { addCuratorNote } = await import('../curators/admin')
        await addCuratorNote(req.payload, req.user as User, { id, note: String(body.note ?? '') })
      }, 'Curator note'),
    },
    {
      // GET /api/applications/:id/curator-file/portfolio or /cv. Staff only; never cached
      path: '/:id/curator-file/:kind',
      method: 'get',
      handler: async (req) => {
        if (!isStaff(req.user)) return refuse(req, 'Only staff can open these files.')
        try {
          const { curatorFile } = await import('../curators/admin')
          const { fileResponse } = await import('../utilities/fileResponse')
          const { file, bytes } = await curatorFile(
            req.payload,
            Number(req.routeParams?.id),
            String(req.routeParams?.kind),
          )
          return fileResponse(bytes, file)
        } catch (error) {
          return failed(req, error, 'Curator file')
        }
      },
    },
  ]
}

/**
 * How someone asks to work with PJK: as an artist, as a trade partner, or as a guest curator (the
 * brief of 25 November 2026: one store for every application, with a type). An artist or partner
 * signs in, may apply as both, and has at most one current application of each kind. A guest
 * curator needs no account: theirs is written by the server from the public form, and staff
 * follow it on the Curators screen rather than deciding it here. It exists from
 * the moment an applicant verifies their email (as a draft), carries a reference they can quote
 * (A-7K3Q9X for an artist, PT-7K3Q9X for a partner), and moves through its stages as
 * src/members/stages.ts allows, and no other way:
 *
 *   draft → submitted → under review → approved
 *                                    → changes requested → submitted again
 *                                    → declined
 *   (and, until it is decided, withdrawn by the applicant)
 *
 * Someone declined or withdrawn who applies again gets a new application, with its own reference,
 * pointing back to this one; staff see every earlier one in its history.
 *
 * Nobody moves the stage by editing it. Applicants submit and withdraw; staff decide through
 * POST /api/applications/:id/decide, which runs the approval transaction and issues the member ID
 * (src/members/decide.ts).
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
      'Applications from artists, trade partners and guest curators. Approving an artist or partner issues the member ID and emails the applicant. Guest curators are followed on the Curators screen.',
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
      // Every artist and partner application has one; a guest curator's has none
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      index: true,
      access: { update: nobody },
      admin: { readOnly: true, condition: (data) => data?.type !== 'curator' },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Artist', value: 'artist' },
        { label: 'Partner', value: 'partner' },
        { label: 'Guest curator', value: 'curator' },
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
        { label: 'Declined', value: 'rejected' },
        { label: 'Withdrawn by the applicant', value: 'withdrawn' },
      ],
      // Moved only by the server: a submission, or a staff decision through /decide
      access: { update: nobody },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'withdrawnAt',
      type: 'date',
      access: { update: nobody },
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: (data) => data?.stage === 'withdrawn',
      },
    },
    {
      // The application this one follows, when someone applied again after a decline or a
      // withdrawal
      name: 'previousApplication',
      label: 'Follows',
      type: 'relationship',
      relationTo: 'applications',
      access: { update: nobody },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      // "<member>:<type>" on a person's current application of a kind, and empty on every earlier
      // one. Unique, so two current applications of one kind cannot exist, even when two requests
      // race
      name: 'currentSlot',
      type: 'text',
      unique: true,
      index: true,
      hidden: true,
    },
    {
      name: 'history',
      type: 'ui',
      admin: {
        components: { Field: '@/components/admin/ApplicationHistory#ApplicationHistory' },
      },
    },
    {
      name: 'partnerCategory',
      type: 'select',
      options: PARTNER_CATEGORIES.map(({ value, label }) => ({ value, label })),
      admin: { position: 'sidebar', condition: (data) => data?.type === 'partner' },
    },
    ...artistApplicationFields.map(writtenByApplicant),
    ...partnerApplicationFields.map(writtenByApplicant),
    ...curatorApplicationFields,
    ...consentRecordFields,
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
        description:
          'Earlier decisions on this same record, from before each application had a record of its own (October 2026). Later applications appear under History instead.',
        condition: (data) => Boolean(data?.rounds?.length),
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
      ({ data, operation, originalDoc }) => {
        if (operation === 'create' && !APPLICATION_REFERENCE_PATTERN.test(String(data.reference))) {
          throw publicError('Applications are given a reference by the server.', 400)
        }
        // Only a guest curator's application stands without an account
        if (operation === 'create' && data.type !== 'curator' && !data.member) {
          throw publicError('An artist or partner application belongs to a member.', 400)
        }
        // A new application is always its person's current one of its kind; the unique slot then
        // refuses a second beside it, however it is created (src/members/reapply.ts clears the
        // earlier one's first)
        if (operation === 'create') {
          const member = typeof data.member === 'object' ? data.member?.id : data.member
          if (member && data.type) data.currentSlot = `${member}:${data.type}`
        }
        // Stages move only as src/members/stages.ts allows, whoever asks
        const from = originalDoc?.stage as Stage | undefined
        const to = data.stage as Stage | undefined
        if (operation === 'update' && from && to && !canMove(from, to)) {
          throw publicError(`An application that is "${from}" cannot become "${to}".`, 409)
        }
        return data
      },
    ],
  },
  // Every application of a person, of a kind, found quickly; at most one is current (currentSlot)
  indexes: [{ fields: ['member', 'type'] }],
  endpoints: [
    ...curatorEndpoints(),
    {
      // POST /api/applications/:id/allow-reapply. Staff only; logged
      path: '/:id/allow-reapply',
      method: 'post',
      handler: async (req) => {
        if (!isStaff(req.user)) return refuse(req, 'Not allowed.')
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
          return refuse(req, 'Only staff can decide applications.')
        }
        const id = Number(req.routeParams?.id)
        const body = (await req.json?.().catch(() => ({}))) as { decision?: string; note?: string }
        const decision = body?.decision as Decision
        if (!Number.isSafeInteger(id) || !DECISIONS.includes(decision)) {
          return Response.json(
            { message: 'Choose review, approve, reject or request-changes.' },
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
