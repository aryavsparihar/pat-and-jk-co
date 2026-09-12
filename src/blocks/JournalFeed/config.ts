import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

export const JournalFeed: Block = {
  slug: 'journalFeed',
  interfaceName: 'JournalFeedBlock',
  labels: { singular: 'Journal feed', plural: 'Journal feeds' },
  fields: [
    eyebrowField(),
    headingField(),
    introField(),
    {
      type: 'row',
      fields: [
        {
          name: 'limit',
          type: 'number',
          defaultValue: 3,
          min: 1,
          max: 48,
          admin: { width: '50%' },
        },
        {
          name: 'showViewAll',
          type: 'checkbox',
          defaultValue: true,
          label: 'Show "View all" link',
          admin: { width: '50%', style: { alignSelf: 'flex-end' } },
        },
      ],
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: {
        description: 'Only show posts in these categories (optional).',
      },
    },
    {
      name: 'emptyMessage',
      type: 'text',
      defaultValue: 'New stories are on their way.',
    },
  ],
}
