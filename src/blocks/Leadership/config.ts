import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

export const Leadership: Block = {
  slug: 'leadership',
  interfaceName: 'LeadershipBlock',
  labels: { singular: 'People grid', plural: 'People grids' },
  fields: [
    eyebrowField(),
    headingField(),
    introField(),
    {
      name: 'populateBy',
      type: 'select',
      defaultValue: 'all',
      options: [
        { label: 'Everyone (in display order)', value: 'all' },
        { label: 'Choose people', value: 'selection' },
      ],
    },
    {
      name: 'people',
      type: 'relationship',
      relationTo: 'people',
      hasMany: true,
      admin: {
        condition: (_, siblingData) => siblingData?.populateBy === 'selection',
      },
    },
  ],
}
