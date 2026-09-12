import type { Block } from 'payload'

import { bodyLexical } from '@/fields/defaultLexical'
import { eyebrowField, headingField } from '@/fields/common'

export const Manifesto: Block = {
  slug: 'manifesto',
  interfaceName: 'ManifestoBlock',
  labels: { singular: 'Statement', plural: 'Statements' },
  fields: [
    eyebrowField(),
    headingField({ required: true }),
    {
      name: 'content',
      type: 'richText',
      editor: bodyLexical,
      required: true,
    },
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'split',
      options: [
        { label: 'Heading left, text right', value: 'split' },
        { label: 'Centered', value: 'centered' },
      ],
    },
  ],
}
