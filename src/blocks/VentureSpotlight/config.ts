import type { Block } from 'payload'

import { eyebrowField } from '@/fields/common'

export const VentureSpotlight: Block = {
  slug: 'ventureSpotlight',
  interfaceName: 'VentureSpotlightBlock',
  labels: { singular: 'Venture spotlight', plural: 'Venture spotlights' },
  fields: [
    eyebrowField({ defaultValue: 'Our flagship' }),
    {
      name: 'venture',
      type: 'relationship',
      relationTo: 'ventures',
      required: true,
    },
    {
      name: 'linkLabel',
      type: 'text',
      admin: {
        description: 'Defaults to "Discover <venture name>".',
      },
    },
  ],
}
