import type { Block, Field } from 'payload'

import { bodyLexical } from '@/fields/defaultLexical'
import { link } from '@/fields/link'

const columnFields: Field[] = [
  {
    name: 'size',
    type: 'select',
    defaultValue: 'full',
    options: [
      {
        label: 'One Third',
        value: 'oneThird',
      },
      {
        label: 'Half',
        value: 'half',
      },
      {
        label: 'Two Thirds',
        value: 'twoThirds',
      },
      {
        label: 'Full',
        value: 'full',
      },
    ],
  },
  {
    name: 'richText',
    type: 'richText',
    editor: bodyLexical,
    label: false,
  },
  {
    name: 'enableLink',
    type: 'checkbox',
  },
  link({
    appearances: ['default', 'outline', 'text'],
    overrides: {
      admin: {
        condition: (_data, siblingData) => {
          return Boolean(siblingData?.enableLink)
        },
      },
    },
  }),
]

export const Content: Block = {
  slug: 'content',
  interfaceName: 'ContentBlock',
  labels: { singular: 'Text', plural: 'Text' },
  fields: [
    {
      name: 'sectionNav',
      label: 'List the section headings in a panel on the left',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'For long documents such as the privacy policy: each main heading becomes a group in the left margin, and each subheading a link to its section.',
      },
    },
    {
      name: 'width',
      type: 'select',
      defaultValue: 'narrow',
      options: [
        { label: 'Reading width', value: 'narrow' },
        { label: 'Full container', value: 'wide' },
      ],
    },
    {
      name: 'columns',
      type: 'array',
      admin: {
        initCollapsed: true,
      },
      fields: columnFields,
    },
  ],
}
