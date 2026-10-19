import type { CollectionConfig, Field, FieldAccess, TextField } from 'payload'

import { isKycReviewer, kycReviewerOnly } from '../access/roles'
import { refuse } from '../security/refused'

const nobody: FieldAccess = () => false

/** Ciphertext: stored, never returned by any API, not even to KYC reviewers (they use reveal) */
const sealed = (name: string, options: { index?: boolean } = {}): TextField => ({
  name,
  type: 'text',
  index: options.index,
  access: { read: nobody, create: nobody, update: nobody },
  admin: { hidden: true },
})

const masked = (name: string, label: string): Field => ({
  name,
  label,
  type: 'text',
  access: { create: nobody, update: nobody },
  admin: { readOnly: true },
})

const bankFields = (prefix: '' | 'pending'): Field[] => {
  const n = (name: string) => (prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name)
  return [
    sealed(n('accountNumberSealed')),
    sealed(n('ifscSealed')),
    sealed(n('holderNameSealed')),
    sealed(n('branchNameSealed')),
    masked(n('accountMasked'), 'Account number'),
    masked(n('ifscMasked'), 'IFSC'),
    {
      name: n('bankName'),
      label: 'Bank',
      type: 'text',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true },
    },
    {
      name: n('accountType'),
      label: 'Account type',
      type: 'select',
      options: [
        { label: 'Savings', value: 'savings' },
        { label: 'Current', value: 'current' },
      ],
      access: { create: nobody, update: nobody },
      admin: { readOnly: true },
    },
  ]
}

/**
 * Identity and bank details for one artist. The most sensitive data on the site, kept apart from
 * everything else (see docs/KYC.md):
 *
 *   - its own collection, never fields on a member, and never populated into anything else
 *   - every sensitive value encrypted with a data key of its own (AES-256-GCM), the key wrapped by
 *     a master key that lives only in the environment (src/kyc/crypto.ts)
 *   - no API returns the encrypted values or the keys, to anyone; the admin shows masked values
 *   - only super admins and KYC reviewers can open a record at all, and seeing a full value takes
 *     a reveal with a written reason, every one of which is logged
 *   - nothing can create or change a record through the API: only the server, after checking
 *   - no GraphQL
 *
 * Aadhaar: only the last four digits are ever accepted or stored, with a masked copy of the card.
 */
export const KycRecords: CollectionConfig = {
  slug: 'kyc-records',
  labels: { singular: 'KYC record', plural: 'KYC records' },
  graphQL: false,
  access: {
    create: () => false,
    read: kycReviewerOnly,
    update: () => false,
    delete: () => false,
    admin: ({ req: { user } }) => isKycReviewer(user),
  },
  admin: {
    group: 'Members',
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'idMasked', 'aadhaarMasked', 'accountMasked', 'bankName'],
    hidden: ({ user }) => !isKycReviewer(user),
    description:
      'Identity and bank details. Values are encrypted and shown masked; revealing one asks for a reason and is recorded in the security log.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      unique: true,
      index: true,
      access: { create: nobody, update: nobody },
      admin: { readOnly: true },
    },
    // Shown in lists: the application reference, so nobody needs a name to find a record
    masked('reference', 'Application'),

    // Envelope encryption: the record's data key, wrapped by the master key
    sealed('keyId'),
    sealed('wrappedKey'),

    {
      // Always "pan" now that every artist gives a PAN; kept for records saved before
      name: 'idType',
      label: 'Identity document',
      type: 'select',
      options: [
        { label: 'PAN', value: 'pan' },
        { label: 'Aadhaar (last four digits)', value: 'aadhaar' },
      ],
      access: { create: nobody, update: nobody },
      admin: { readOnly: true },
    },
    sealed('panSealed'),
    sealed('panNameSealed'),
    sealed('aadhaarLast4Sealed'),
    masked('idMasked', 'PAN'),
    {
      name: 'idChoice',
      label: 'Second identity document',
      type: 'select',
      options: [
        { label: 'Masked e-Aadhaar', value: 'aadhaar' },
        { label: 'Another ID, checked by hand', value: 'other' },
      ],
      access: { create: nobody, update: nobody },
      admin: { readOnly: true },
    },
    {
      name: 'otherIdKind',
      label: 'Other ID',
      type: 'select',
      options: [
        { label: 'Passport', value: 'passport' },
        { label: 'Voter ID', value: 'voter-id' },
        { label: 'Driving licence', value: 'driving-licence' },
      ],
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, condition: (data) => data?.idChoice === 'other' },
    },
    masked('aadhaarMasked', 'Aadhaar (last four only)'),
    {
      // What the masked e-Aadhaar check found (src/kyc/aadhaarCheck.ts); shown in the sidebar
      name: 'aadhaarCheck',
      label: 'Masked e-Aadhaar check',
      type: 'group',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, condition: (data) => data?.idChoice === 'aadhaar' },
      fields: [
        {
          name: 'result',
          type: 'select',
          options: [
            { label: 'Verified', value: 'verified' },
            { label: 'Could not verify', value: 'not-verified' },
            { label: 'Needs a check by hand', value: 'manual-review' },
          ],
        },
        { name: 'reasons', type: 'textarea' },
        { name: 'signer', type: 'text' },
        { name: 'signedOn', type: 'text' },
        { name: 'checkedAt', type: 'date' },
        { name: 'mode', type: 'text' },
      ],
    },
    {
      name: 'addressOnIdMatches',
      label: 'Address on the ID matches the address given',
      type: 'checkbox',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true },
    },
    {
      name: 'identityCode',
      label: 'Code on the identity photo',
      type: 'text',
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        description:
          'The code the artist was given, which they wrote with their full name and date of birth on the paper they hold in the identity photo. Check all three are there, legible, and match.',
      },
    },
    {
      name: 'identityCodeIssuedAt',
      label: 'Code given',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'identityCodeExpiresAt',
      label: 'Code valid until',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },

    ...bankFields(''),
    {
      name: 'nameMismatch',
      label: 'Account holder name differs from the applicant’s',
      type: 'checkbox',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, description: 'A warning only. Check before approving.' },
    },

    // Duplicate detection without decrypting anything (HMAC under KYC_BLIND_INDEX_KEY)
    sealed('panIndex', { index: true }),
    sealed('accountIndex', { index: true }),
    masked('duplicates', 'Also used by'),

    {
      // Listed, and downloaded with a reason, in the sidebar (KycPanel); not shown as links to
      // the documents' own rows, which hold nothing readable
      name: 'documents',
      type: 'relationship',
      relationTo: 'kyc-documents',
      hasMany: true,
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, hidden: true },
    },

    // Ready for an automatic check (penny drop, PAN verification) later; manual for now
    {
      name: 'verification',
      type: 'group',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true },
      fields: [
        {
          name: 'status',
          type: 'select',
          defaultValue: 'unverified',
          options: [
            { label: 'Not yet verified', value: 'unverified' },
            { label: 'Verified', value: 'verified' },
            { label: 'Failed', value: 'failed' },
          ],
        },
        {
          name: 'method',
          type: 'select',
          options: [
            { label: 'Checked by staff against the documents', value: 'manual' },
            { label: 'Penny drop', value: 'penny-drop' },
            { label: 'PAN verification service', value: 'pan-service' },
          ],
        },
        { name: 'verifiedAt', type: 'date' },
        { name: 'verifiedBy', type: 'relationship', relationTo: 'users' },
        { name: 'providerReference', type: 'text' },
      ],
    },

    // A change of bank details after approval: held here until staff re-verify it
    {
      name: 'pendingBank',
      label: 'Requested change of bank details',
      type: 'group',
      admin: {
        readOnly: true,
        description: 'The current details stay in force until this is approved.',
      },
      fields: [
        ...bankFields('pending'),
        { name: 'requestedAt', type: 'date', access: { create: nobody, update: nobody } },
        sealed('cancelTokenHash'),
      ],
    },

    {
      // Reveal (with a reason), documents, and approving a change of bank details
      name: 'actions',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/KycPanel#KycPanel' },
      },
    },

    // Consent and retention (docs/KYC.md)
    {
      // The record of consent: set only when the artist gives it, never edited or cleared
      name: 'consentedAt',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'When the artist gave consent. A record: it cannot be changed.',
      },
    },
    {
      name: 'consentNoticeVersion',
      label: 'Privacy notice consented to',
      type: 'text',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'consentConfirmation',
      label: 'How consent was given',
      type: 'text',
      access: { create: nobody, update: nobody },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      // Set by the artist's own request, or by "Record a withdrawal" with a logged reason
      name: 'consentWithdrawnAt',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description:
          'Set when the artist withdraws consent. For a withdrawal received by letter or email, use "Record a withdrawal" above.',
      },
    },
    {
      name: 'payoutRequestedAt',
      label: 'Payout details requested',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description:
          'When the artist was last asked to add payout details, with "Request payout details" above.',
      },
    },
    {
      name: 'legalHoldUntil',
      type: 'date',
      access: { create: nobody, update: nobody },
      admin: {
        readOnly: true,
        position: 'sidebar',
        description:
          'Kept until this date even if consent is withdrawn, where the law requires it (e.g. records of payments). Changed only with "Legal hold" above, which logs a reason.',
      },
    },
  ],
  endpoints: [
    {
      // POST /api/kyc-records/:id/reveal  { reason }. KYC reviewers only; logged with the reason
      path: '/:id/reveal',
      method: 'post',
      handler: async (req) => {
        if (!isKycReviewer(req.user)) return refuse(req, 'Not allowed.')
        // Loaded here, not at the top: the KYC code is server-only, and this file is also read
        // by the Payload CLI (migrations), where a server-only module refuses to load
        const { KycError, revealKyc } = await import('../kyc/service')
        const body = (await req.json?.().catch(() => ({}))) as { reason?: string }
        try {
          const values = await revealKyc(req.payload, {
            recordId: Number(req.routeParams?.id),
            actor: req.user,
            reason: body?.reason,
          })
          return Response.json(
            { values, hideAfterSeconds: 60 },
            { headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' } },
          )
        } catch (error) {
          if (error instanceof KycError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'KYC reveal failed' })
          return Response.json({ message: 'The record could not be opened.' }, { status: 500 })
        }
      },
    },
    {
      // POST /api/kyc-records/:id/approve-bank-change. KYC reviewers only; logged
      path: '/:id/approve-bank-change',
      method: 'post',
      handler: async (req) => {
        if (!isKycReviewer(req.user)) return refuse(req, 'Not allowed.')
        const { KycError, approveBankChange } = await import('../kyc/service')
        try {
          await approveBankChange(req.payload, {
            recordId: Number(req.routeParams?.id),
            actor: req.user,
          })
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          if (error instanceof KycError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Bank change approval failed' })
          return Response.json({ message: 'The change could not be approved.' }, { status: 500 })
        }
      },
    },
    {
      // POST /api/kyc-records/:id/request-payout-details. KYC reviewers only; logged. Emails the
      // artist a link to their account; the email never asks for, or carries, bank details
      path: '/:id/request-payout-details',
      method: 'post',
      handler: async (req) => {
        if (!isKycReviewer(req.user)) return refuse(req, 'Not allowed.')
        const { KycError, requestPayoutDetails } = await import('../kyc/service')
        const { sendPayoutDetailsRequest } = await import('../members/emails')
        try {
          const { member } = await requestPayoutDetails(req.payload, {
            recordId: Number(req.routeParams?.id),
            actor: req.user,
          })
          const sent = await sendPayoutDetailsRequest(req.payload, { member })
          if (!sent)
            return Response.json(
              { message: 'The request is recorded, but the email could not be sent. Try again.' },
              { status: 502 },
            )
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          if (error instanceof KycError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Payout details request failed' })
          return Response.json({ message: 'The request could not be sent.' }, { status: 500 })
        }
      },
    },
    {
      // POST /api/kyc-records/:id/record-withdrawal { reason }. KYC reviewers only; logged with the reason
      path: '/:id/record-withdrawal',
      method: 'post',
      handler: async (req) => {
        if (!isKycReviewer(req.user)) return refuse(req, 'Not allowed.')
        const { KycError, recordConsentWithdrawal } = await import('../kyc/service')
        const body = (await req.json?.().catch(() => ({}))) as {
          reason?: string
          until?: string | null
        }
        try {
          await recordConsentWithdrawal(req.payload, {
            recordId: Number(req.routeParams?.id),
            actor: req.user,
            reason: body?.reason,
          })
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          if (error instanceof KycError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Recording a consent withdrawal failed' })
          return Response.json(
            { message: 'The withdrawal could not be recorded.' },
            { status: 500 },
          )
        }
      },
    },
    {
      // POST /api/kyc-records/:id/legal-hold { until: "YYYY-MM-DD" | null, reason }. KYC reviewers only; logged with the reason
      path: '/:id/legal-hold',
      method: 'post',
      handler: async (req) => {
        if (!isKycReviewer(req.user)) return refuse(req, 'Not allowed.')
        const { KycError, setLegalHold } = await import('../kyc/service')
        const body = (await req.json?.().catch(() => ({}))) as {
          reason?: string
          until?: string | null
        }
        try {
          await setLegalHold(req.payload, {
            recordId: Number(req.routeParams?.id),
            actor: req.user,
            reason: body?.reason,
            until: body?.until,
          })
          return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          if (error instanceof KycError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Changing a legal hold failed' })
          return Response.json({ message: 'The legal hold could not be changed.' }, { status: 500 })
        }
      },
    },
  ],
  timestamps: true,
}
