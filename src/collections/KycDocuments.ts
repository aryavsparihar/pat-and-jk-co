import type { CollectionConfig, FieldAccess } from 'payload'

import { isKycReviewer, kycReviewerOnly } from '../access/roles'

const nobody: FieldAccess = () => false

/**
 * The record of an encrypted KYC document: what kind it is and where its ciphertext lives. The
 * file itself is encrypted on the server before it is stored (src/kyc/documentStore.ts), in a
 * private store, and is only ever served decrypted through a staff route that asks for a reason,
 * logs the opening, and sends it as a download that nothing caches.
 */
export const KycDocuments: CollectionConfig = {
  slug: 'kyc-documents',
  labels: { singular: 'KYC document', plural: 'KYC documents' },
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
    hidden: ({ user }) => !isKycReviewer(user),
    defaultColumns: ['kind', 'member', 'contentType', 'createdAt'],
  },
  fields: [
    {
      name: 'member',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'PAN card', value: 'pan-card' },
        { label: 'Masked Aadhaar', value: 'masked-aadhaar' },
        { label: 'Passport, voter ID or driving licence', value: 'other-id' },
        { label: 'Proof of address', value: 'address-proof' },
        { label: 'Cancelled cheque or passbook', value: 'bank-proof' },
      ],
      admin: { readOnly: true },
    },
    { name: 'contentType', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'size', type: 'number', admin: { readOnly: true } },
    {
      name: 'storageKey',
      type: 'text',
      required: true,
      access: { read: nobody, create: nobody, update: nobody },
      admin: { hidden: true },
    },
    {
      name: 'keyId',
      type: 'text',
      required: true,
      access: { read: nobody, create: nobody, update: nobody },
      admin: { hidden: true },
    },
    {
      name: 'wrappedKey',
      type: 'text',
      required: true,
      access: { read: nobody, create: nobody, update: nobody },
      admin: { hidden: true },
    },
  ],
  endpoints: [
    {
      // POST /api/kyc-documents/:id/download  { reason }. KYC reviewers only; logged; never cached
      path: '/:id/download',
      method: 'post',
      handler: async (req) => {
        if (!isKycReviewer(req.user))
          return Response.json({ message: 'Not allowed.' }, { status: 403 })
        // Loaded here so the Payload CLI, which reads this file, never loads the KYC code
        const { KycError, openKycDocument } = await import('../kyc/service')
        const body = (await req.json?.().catch(() => ({}))) as { reason?: string }
        try {
          const file = await openKycDocument(req.payload, {
            documentId: Number(req.routeParams?.id),
            actor: req.user,
            reason: body?.reason,
          })
          return new Response(new Uint8Array(file.bytes), {
            headers: {
              'Content-Type': file.contentType,
              'Content-Disposition': `attachment; filename="${file.filename}"`,
              'Content-Length': String(file.bytes.length),
              'Cache-Control': 'no-store, max-age=0',
              Pragma: 'no-cache',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy': "default-src 'none'; sandbox",
            },
          })
        } catch (error) {
          if (error instanceof KycError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'KYC document download failed' })
          return Response.json({ message: 'The document could not be opened.' }, { status: 500 })
        }
      },
    },
  ],
  timestamps: true,
}
