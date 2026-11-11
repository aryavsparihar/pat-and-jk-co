import type { CollectionConfig, FieldAccess } from 'payload'

import { isKycReviewer, kycReviewerOnly } from '../access/roles'

const nobody: FieldAccess = () => false

const shown = { readOnly: true } as const
const dayAndTime = { readOnly: true, date: { pickerAppearance: 'dayAndTime' as const } }

/**
 * One signing of the artist or trade agreement (src/agreements): who signed, against which
 * version, with which ten-minute code and live photo, from where and when, and the signed PDF.
 * Written only by the server, at /collaborate/artist-agreement and /collaborate/trade-agreement.
 * The photo and both PDFs are KYC documents, encrypted, and are downloaded from the panel in the
 * sidebar, with a reason. A PAT & J.K. Co. officer countersigns with their DSC outside the site
 * and uploads the result there, which sends the executed agreement to the signer and compliance.
 */
export const AgreementExecutions: CollectionConfig = {
  slug: 'agreement-executions',
  labels: { singular: 'Signed agreement', plural: 'Signed agreements' },
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
    useAsTitle: 'memberCode',
    defaultColumns: ['memberCode', 'kind', 'state', 'signedAt'],
    description:
      'Agreements signed on the site. Open one to download the signed PDF, countersign it with the DSC, and upload the countersigned copy, which is then sent to the signer and to compliance.',
  },
  fields: [
    {
      name: 'agreementPanel',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/AgreementPanel#AgreementPanel' },
      },
    },
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
      admin: shown,
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Artist agreement', value: 'artist' },
        { label: 'Trade agreement', value: 'partner' },
      ],
      admin: shown,
    },
    { name: 'memberCode', label: 'Member ID', type: 'text', index: true, admin: shown },
    {
      // Not "status": avoids any clash with Payload's own field names
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'in-progress',
      options: [
        { label: 'Being signed', value: 'in-progress' },
        { label: 'Pending Admin DSC Countersignature', value: 'pending-countersignature' },
        { label: 'Executed and sent', value: 'executed' },
      ],
      admin: { ...shown, position: 'sidebar' },
    },
    { name: 'version', label: 'Agreement version', type: 'text', admin: shown },
    {
      name: 'documentDigest',
      label: 'SHA-256 of the agreement text',
      type: 'text',
      admin: shown,
    },

    // The ten-minute code: only its HMAC, until the photo is taken with it
    {
      name: 'codeHash',
      type: 'text',
      access: { read: nobody, create: nobody, update: nobody },
      admin: { hidden: true },
    },
    { name: 'codeIssuedAt', label: 'Code given', type: 'date', admin: dayAndTime },
    { name: 'codeExpiresAt', label: 'Code valid until', type: 'date', admin: dayAndTime },
    { name: 'verificationCode', label: 'Code on the photo', type: 'text', admin: shown },
    {
      name: 'photo',
      label: 'Live verification photo',
      type: 'relationship',
      relationTo: 'kyc-documents',
      admin: shown,
    },
    { name: 'photoAt', label: 'Photo received', type: 'date', admin: dayAndTime },
    { name: 'photoSha256', label: 'SHA-256 of the photo', type: 'text', admin: shown },

    {
      // As shown to the signer and printed on the PDF. The full PAN stays in the KYC record.
      name: 'signer',
      type: 'group',
      admin: shown,
      fields: [
        { name: 'name', label: 'Full legal name', type: 'text' },
        { name: 'firm', label: 'Firm / studio legal name', type: 'text' },
        { name: 'taxIdMasked', label: 'PAN / passport / tax ID', type: 'text' },
        { name: 'firmRegistration', label: 'Firm GSTIN / COA / Reg. No.', type: 'text' },
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'text' },
        { name: 'address', type: 'textarea' },
      ],
    },
    { name: 'typed', label: 'Typed', type: 'text', admin: shown },
    { name: 'signedAt', label: 'Signed', type: 'date', admin: dayAndTime },
    { name: 'signedAtIst', label: 'Signed (IST, as printed)', type: 'text', admin: shown },
    { name: 'ip', label: 'IP address', type: 'text', admin: shown },
    { name: 'userAgent', label: 'Browser', type: 'textarea', admin: shown },
    {
      name: 'signedPdf',
      label: 'Signed PDF',
      type: 'relationship',
      relationTo: 'kyc-documents',
      admin: shown,
    },
    { name: 'signedPdfSha256', label: 'SHA-256 of the signed PDF', type: 'text', admin: shown },
    {
      name: 'countersignedPdf',
      label: 'DSC-countersigned PDF',
      type: 'relationship',
      relationTo: 'kyc-documents',
      admin: shown,
    },
    {
      name: 'countersignedPdfSha256',
      label: 'SHA-256 of the countersigned PDF',
      type: 'text',
      admin: shown,
    },
    {
      name: 'countersignedAt',
      label: 'Countersigned copy uploaded',
      type: 'date',
      admin: dayAndTime,
    },
    {
      name: 'countersignedBy',
      label: 'Uploaded by',
      type: 'relationship',
      relationTo: 'users',
      admin: shown,
    },
    { name: 'sentAt', label: 'Sent to signer and compliance', type: 'date', admin: dayAndTime },
  ],
  endpoints: [
    {
      // POST /api/agreement-executions/:id/download  { file, reason }. KYC reviewers only; logged
      path: '/:id/download',
      method: 'post',
      handler: async (req) => {
        const { downloadAgreementFile } = await import('../agreements/staff')
        return downloadAgreementFile(req)
      },
    },
    {
      // POST /api/agreement-executions/:id/countersign  multipart { file }. Sends it on.
      path: '/:id/countersign',
      method: 'post',
      handler: async (req) => {
        const { uploadCountersigned } = await import('../agreements/staff')
        return uploadCountersigned(req)
      },
    },
  ],
  timestamps: true,
}
