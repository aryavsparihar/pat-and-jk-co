import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

export const Openings: Block = {
  slug: 'openings',
  interfaceName: 'OpeningsBlock',
  labels: { singular: 'Openings list', plural: 'Openings lists' },
  fields: [
    eyebrowField(),
    headingField(),
    introField(),
    {
      name: 'emptyMessage',
      type: 'text',
      defaultValue: 'There are no open calls right now — but we are always glad to hear from you.',
    },
  ],
}
