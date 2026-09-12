import type { Block } from 'payload'

import { eyebrowField, headingField } from '@/fields/common'
import { linkGroup } from '@/fields/linkGroup'

export const CtaBand: Block = {
  slug: 'ctaBand',
  interfaceName: 'CtaBandBlock',
  labels: { singular: 'Call to action', plural: 'Calls to action' },
  fields: [
    eyebrowField(),
    headingField({ required: true }),
    {
      name: 'text',
      type: 'textarea',
    },
    linkGroup({
      appearances: ['default', 'outline', 'text'],
      overrides: { maxRows: 2 },
    }),
    {
      name: 'tone',
      type: 'select',
      defaultValue: 'surface',
      admin: {
        description:
          'Tip: avoid the brand colour band as the last block on a page — it merges with the footer.',
      },
      options: [
        { label: 'Paper tone', value: 'surface' },
        { label: 'Brand colour band', value: 'primary' },
      ],
    },
  ],
}
