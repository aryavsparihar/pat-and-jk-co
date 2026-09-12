import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

export const Principles: Block = {
  slug: 'principles',
  interfaceName: 'PrinciplesBlock',
  labels: { singular: 'Principles', plural: 'Principles' },
  fields: [
    eyebrowField(),
    headingField(),
    introField(),
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 6,
      required: true,
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'text',
          type: 'textarea',
          required: true,
        },
      ],
    },
    {
      name: 'numbering',
      type: 'select',
      defaultValue: 'roman',
      options: [
        { label: 'Roman numerals (I, II, III)', value: 'roman' },
        { label: 'None', value: 'none' },
      ],
    },
  ],
}
