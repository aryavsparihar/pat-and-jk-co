import type { Block } from 'payload'

export const Quote: Block = {
  slug: 'quote',
  interfaceName: 'QuoteBlock',
  labels: { singular: 'Quote', plural: 'Quotes' },
  fields: [
    {
      name: 'quote',
      type: 'textarea',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'attribution',
          type: 'text',
          admin: { width: '50%' },
        },
        {
          name: 'role',
          type: 'text',
          admin: { width: '50%' },
        },
      ],
    },
  ],
}
