import type { CollectionConfig, FieldAccess } from 'payload'

import { authenticated } from '../access/authenticated'
import { TOPIC_GROUPS } from '../contact/topics'
import { refuse } from '../security/refused'

const nobody: FieldAccess = () => false

/**
 * One row per message sent from the contact page (pjk.co.in/contact): who wrote, about what, the
 * message, and the files sent with it (the brief of 25 November 2026, section 11). The message is
 * also emailed to the inbox its subject belongs to, with the sender as reply-to. Written by the
 * server; staff change only the status.
 *
 * While its files are still arriving, a message is "receiving" and nobody has been told of it.
 * The files are encrypted in the private store (src/contact/store.ts); staff open them through
 * GET /api/enquiries/:id/files/:n.
 */
export const Enquiries: CollectionConfig = {
  slug: 'enquiries',
  labels: { singular: 'Contact message', plural: 'Contact messages' },
  access: {
    create: () => false,
    read: authenticated,
    update: authenticated,
    delete: () => false,
  },
  admin: {
    group: 'Enquiries',
    useAsTitle: 'name',
    defaultColumns: ['name', 'topic', 'inbox', 'status', 'createdAt'],
    description:
      'Every message sent from the contact page. Each was also emailed to the inbox shown, so it can be answered with Reply. Once it has been dealt with, set its status to Resolved and save.',
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (data.status === 'resolved' && originalDoc?.status !== 'resolved')
          data.resolvedAt = new Date().toISOString()
        if (data.status === 'active') data.resolvedAt = null
        return data
      },
    ],
  },
  defaultSort: '-createdAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          access: { update: nobody },
          admin: { readOnly: true, width: '50%' },
        },
        {
          name: 'email',
          type: 'email',
          required: true,
          index: true,
          access: { update: nobody },
          admin: { readOnly: true, width: '50%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'topic',
          label: 'Writing about',
          type: 'select',
          required: true,
          options: TOPIC_GROUPS.flatMap((group) =>
            group.topics.map((t) => ({ value: t.value, label: `${group.label}: ${t.label}` })),
          ),
          access: { update: nobody },
          admin: { readOnly: true, width: '50%' },
        },
        {
          name: 'inbox',
          label: 'Sent to',
          type: 'select',
          required: true,
          options: [
            { label: 'business@', value: 'business' },
            { label: 'tech@', value: 'tech' },
            { label: 'compliance@', value: 'compliance' },
          ],
          access: { update: nobody },
          admin: { readOnly: true, width: '50%' },
        },
      ],
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      access: { update: nobody },
      admin: { readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Receiving files', value: 'receiving' },
        { label: 'Active', value: 'active' },
        { label: 'Resolved', value: 'resolved' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Set to Resolved and save once the message has been dealt with.',
      },
    },
    {
      name: 'resolvedAt',
      label: 'Resolved on',
      type: 'date',
      access: { update: nobody },
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => data?.status === 'resolved',
      },
    },
    {
      name: 'files',
      label: 'Files sent with the message',
      type: 'ui',
      admin: { components: { Field: '@/components/admin/HelpTicketFiles#EnquiryFiles' } },
    },
    {
      // Written by the server once every part of a file has arrived; shown through the field above
      name: 'attachments',
      type: 'array',
      access: { update: nobody },
      admin: { hidden: true },
      fields: [
        { name: 'filename', type: 'text', required: true },
        { name: 'contentType', type: 'text', required: true },
        { name: 'size', type: 'number' },
        { name: 'storageKey', type: 'text', required: true, access: { read: nobody } },
        { name: 'keyId', type: 'text', required: true, access: { read: nobody } },
        { name: 'wrappedKey', type: 'text', required: true, access: { read: nobody } },
      ],
    },
    {
      // While files arrive: a hash of the sender's upload token, when it lapses, the folder, and
      // the files promised with the parts received so far. Cleared when the message is sent
      name: 'upload',
      type: 'group',
      access: { read: nobody, update: nobody },
      admin: { hidden: true },
      fields: [
        { name: 'tokenHash', type: 'text' },
        { name: 'expiresAt', type: 'date' },
        { name: 'folder', type: 'text' },
        { name: 'files', type: 'json' },
      ],
    },
  ],
  endpoints: [
    {
      // GET /api/enquiries/:id/files/:n. Staff only; never cached
      path: '/:id/files/:n',
      method: 'get',
      handler: async (req) => {
        if (!authenticated({ req })) return refuse(req, 'Not allowed.')
        const id = Number(req.routeParams?.id)
        const n = Number(req.routeParams?.n)
        if (!Number.isInteger(id) || !Number.isInteger(n) || n < 0)
          return Response.json({ message: 'Not found.' }, { status: 404 })
        const enquiry = await req.payload
          .findByID({ collection: 'enquiries', id, depth: 0, overrideAccess: true })
          .catch(() => null)
        const file = enquiry?.attachments?.[n]
        if (!file) return Response.json({ message: 'Not found.' }, { status: 404 })
        // Loaded here so the Payload CLI, which reads this file, never loads the store
        const { openSealed } = await import('../contact/store')
        try {
          const bytes = await openSealed(file as never)
          const name = file.filename.replace(/[^\w .()-]+/g, '_')
          // Pictures and PDFs open in the browser; Word documents are saved
          const inline = /^(image\/(jpeg|png)|application\/pdf)$/.test(file.contentType)
          return new Response(new Uint8Array(bytes), {
            headers: {
              'Content-Type': file.contentType,
              'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
              'Content-Length': String(bytes.length),
              'Cache-Control': 'no-store, max-age=0',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy':
                "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
            },
          })
        } catch (error) {
          req.payload.logger.error({ err: error, msg: 'Contact message file could not be opened' })
          return Response.json({ message: 'The file could not be opened.' }, { status: 500 })
        }
      },
    },
  ],
  timestamps: true,
}
