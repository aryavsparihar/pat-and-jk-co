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
      defaultValue: 'primary',
      options: [
        { label: 'Brand colour band', value: 'primary' },
        { label: 'Paper tone', value: 'surface' },
      ],
    },
  ],
}
