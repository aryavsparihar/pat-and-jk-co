import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

export const PageIntro: Block = {
  slug: 'pageIntro',
  interfaceName: 'PageIntroBlock',
  labels: { singular: 'Page intro', plural: 'Page intros' },
  fields: [
    eyebrowField(),
    headingField({ required: true }),
    introField(),
    {
      name: 'align',
      type: 'select',
      defaultValue: 'center',
      options: [
        { label: 'Centered', value: 'center' },
        { label: 'Left', value: 'left' },
      ],
    },
  ],
}
