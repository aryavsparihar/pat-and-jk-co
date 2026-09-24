import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

/**
 * One running total per brand, shown at the foot of the site.
 *
 * Nobody edits this by hand: the counter is written by /next/visits when a browser opens the
 * site for the first time in a session. It is a tally of visits, not of people — no address,
 * cookie or identifier is stored, so the number is honest but approximate.
 */
export const VisitorCounts: CollectionConfig = {
  slug: 'visitor-counts',
  labels: { singular: 'Visitor count', plural: 'Visitor count' },
  access: {
    create: () => false,
    read: authenticated,
    update: () => false,
    delete: () => false,
  },
  admin: {
    group: 'Website',
    defaultColumns: ['total', 'updatedAt'],
    description:
      'How many visits this website has had since counting began. Kept by the site itself; turn the number on or off under Site settings → Footer.',
    useAsTitle: 'total',
  },
  fields: [
    {
      name: 'total',
      label: 'Visits',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
}
