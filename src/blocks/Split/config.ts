import type { Block } from 'payload'

import { bodyLexical } from '@/fields/defaultLexical'
import { eyebrowField, headingField } from '@/fields/common'
import { link } from '@/fields/link'

export const Split: Block = {
  slug: 'split',
  interfaceName: 'SplitBlock',
  labels: { singular: 'Image & text', plural: 'Image & text' },
  fields: [
    eyebrowField(),
    headingField({ required: true }),
    {
      name: 'content',
      type: 'richText',
      editor: bodyLexical,
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'Optional. Without an image, a quiet brand panel with the leaf ornament is shown.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'mediaPosition',
          type: 'select',
          defaultValue: 'right',
          options: [
            { label: 'Image on the right', value: 'right' },
            { label: 'Image on the left', value: 'left' },
          ],
        },
        {
          name: 'background',
          type: 'select',
          defaultValue: 'none',
          options: [
            { label: 'Page background', value: 'none' },
            { label: 'Paper tone', value: 'surface' },
          ],
        },
      ],
    },
    {
      name: 'enableLink',
      type: 'checkbox',
      label: 'Add a link',
    },
    link({
      appearances: ['default', 'outline', 'text'],
      overrides: {
        admin: {
          condition: (_data, siblingData) => Boolean(siblingData?.enableLink),
        },
      },
    }),
  ],
}
