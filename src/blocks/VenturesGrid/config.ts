import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

export const VenturesGrid: Block = {
  slug: 'venturesGrid',
  interfaceName: 'VenturesGridBlock',
  labels: { singular: 'Ventures grid', plural: 'Ventures grids' },
  fields: [
    eyebrowField(),
    headingField(),
    introField(),
    {
      name: 'populateBy',
      type: 'select',
      defaultValue: 'all',
      options: [
        { label: 'All ventures (in display order)', value: 'all' },
        { label: 'Choose ventures', value: 'selection' },
      ],
    },
    {
      name: 'ventures',
      type: 'relationship',
      relationTo: 'ventures',
      hasMany: true,
      admin: {
        condition: (_, siblingData) => siblingData?.populateBy === 'selection',
      },
    },
  ],
}
