import type { Block } from 'payload'

import { eyebrowField, headingField } from '@/fields/common'
import { linkGroup } from '@/fields/linkGroup'

export const Hero: Block = {
  slug: 'hero',
  interfaceName: 'HeroBlock',
  labels: { singular: 'Hero', plural: 'Heroes' },
  fields: [
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'brand',
      required: true,
      options: [
        { label: 'Brand — large logo with a statement', value: 'brand' },
        { label: 'Statement — large heading only', value: 'statement' },
      ],
    },
    eyebrowField(),
    headingField({ required: true }),
    {
      name: 'subheading',
      type: 'textarea',
    },
    linkGroup({
      appearances: ['default', 'outline', 'text'],
      overrides: { maxRows: 2 },
    }),
    {
      name: 'showOrnament',
      type: 'checkbox',
      defaultValue: true,
      label: 'Show the leaf ornament',
    },
  ],
}
