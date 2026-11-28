import type { CollectionConfig, FieldAccess } from 'payload'

import { authenticated } from '../access/authenticated'
import { refuse } from '../security/refused'

const nobody: FieldAccess = () => false

/**
 * One row per request sent from the Help Center (pjk.co.in/help): its ticket number, so every
 * number is unique and staff can look one up, what kind of request it was, whether it is still
 * open, and the files sent with it. The request itself, with the person's name and address, is in
 * the email that went to business@ or tech@ (src/help/emails.ts). Written by the server; staff
 * change only the status.
 *
 * The files are encrypted in the private store (src/help/attachments.ts). The ticket keeps only
 * their names and where they are; staff open them through GET /api/help-tickets/:id/files/:n.
 */
export const HelpTickets: CollectionConfig = {
  slug: 'help-tickets',
  labels: { singular: 'Help Center ticket', plural: 'Help Center tickets' },
  access: {
    create: () => false,
    read: authenticated,
    update: authenticated,
    delete: () => false,
  },
  admin: {
    group: 'Enquiries',
    useAsTitle: 'ticket',
    defaultColumns: [
      'ticket',
      'status',
      'requestType',
      'nature',
      'memberCode',
      'followUps',
      'createdAt',
    ],
    description:
      'Every request sent from the Help Center, by ticket number. The request itself is in the email it was sent to (business@ or tech@). To close a ticket, open it, set its status to Resolved and save; to close several, tick them and use Edit.',
    components: { beforeListTable: ['@/components/admin/HelpTicketTabs#HelpTicketTabs'] },
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
      name: 'ticket',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { update: nobody },
      admin: { readOnly: true },
    },
    {
      name: 'requestType',
      type: 'select',
      required: true,
      options: [
        { label: 'Artist', value: 'artist' },
        { label: 'Trade Partner', value: 'partner' },
      ],
      access: { update: nobody },
      admin: { readOnly: true },
    },
    {
      name: 'nature',
      type: 'select',
      required: true,
      options: [
        { label: 'Technical Issue / Inquiry', value: 'technical' },
        { label: 'Business Inquiry', value: 'business' },
      ],
      access: { update: nobody },
      admin: { readOnly: true },
    },
    {
      name: 'memberCode',
      label: 'Artist / Trade Partner ID given',
      type: 'text',
      index: true,
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
        { label: 'Active', value: 'active' },
        { label: 'Resolved', value: 'resolved' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Set to Resolved and save once the request has been dealt with.',
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
      name: 'followUps',
      label: 'Follow-ups sent',
      type: 'number',
      defaultValue: 0,
      access: { update: nobody },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Messages added to this ticket with "I already have a ticket".',
      },
    },
    {
      name: 'lastFollowUpAt',
      label: 'Last follow-up',
      type: 'date',
      access: { update: nobody },
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        condition: (data) => Boolean(data?.lastFollowUpAt),
      },
    },
    {
      name: 'files',
      label: 'Files sent with the request',
      type: 'ui',
      admin: { components: { Field: '@/components/admin/HelpTicketFiles#HelpTicketFiles' } },
    },
    {
      // Written by the server when the request arrives; shown through the field above
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
  ],
  endpoints: [
    {
      // GET /api/help-tickets/:id/files/:n. Staff only; never cached
      path: '/:id/files/:n',
      method: 'get',
      handler: async (req) => {
        if (!authenticated({ req })) return refuse(req, 'Not allowed.')
        const id = Number(req.routeParams?.id)
        const n = Number(req.routeParams?.n)
        if (!Number.isInteger(id) || !Number.isInteger(n) || n < 0)
          return Response.json({ message: 'Not found.' }, { status: 404 })
        const ticket = await req.payload
          .findByID({ collection: 'help-tickets', id, depth: 0, overrideAccess: true })
          .catch(() => null)
        const file = ticket?.attachments?.[n]
        if (!file) return Response.json({ message: 'Not found.' }, { status: 404 })
        // Loaded here so the Payload CLI, which reads this file, never loads the store
        const { openHelpAttachment } = await import('../help/attachments')
        try {
          const bytes = await openHelpAttachment(file as never)
          const name = file.filename.replace(/[^\w .()-]+/g, '_')
          return new Response(new Uint8Array(bytes), {
            headers: {
              'Content-Type': file.contentType,
              'Content-Disposition': `inline; filename="${name}"`,
              'Content-Length': String(bytes.length),
              'Cache-Control': 'no-store, max-age=0',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy':
                "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
            },
          })
        } catch (error) {
          req.payload.logger.error({ err: error, msg: 'Help Center file could not be opened' })
          return Response.json(
            { message: 'The file could not be opened. Please try again.' },
            { status: 500 },
          )
        }
      },
    },
  ],
  timestamps: true,
}
