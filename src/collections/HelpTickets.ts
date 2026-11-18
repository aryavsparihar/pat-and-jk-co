import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

/**
 * One row per request sent from the Help Center (pjk.co.in/help): its ticket number, so every
 * number is unique and staff can look one up, and what kind of request it was. Nothing personal
 * is kept here: the request itself, with the person's name, address and attachments, is in the
 * email that went to business@ or tech@ (src/help/requests.ts). Written by the server alone.
 */
export const HelpTickets: CollectionConfig = {
  slug: 'help-tickets',
  labels: { singular: 'Help Center ticket', plural: 'Help Center tickets' },
  access: {
    create: () => false,
    read: authenticated,
    update: () => false,
    delete: () => false,
  },
  admin: {
    group: 'Enquiries',
    useAsTitle: 'ticket',
    defaultColumns: ['ticket', 'requestType', 'nature', 'memberCode', 'createdAt'],
    description:
      'Every request sent from the Help Center, by ticket number. The request itself is in the email it was sent to (business@ or tech@).',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'ticket',
      type: 'text',
      required: true,
      unique: true,
      index: true,
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
      admin: { readOnly: true },
    },
    {
      name: 'memberCode',
      label: 'Artist / Trade Partner ID given',
      type: 'text',
      index: true,
      admin: { readOnly: true },
    },
  ],
}
