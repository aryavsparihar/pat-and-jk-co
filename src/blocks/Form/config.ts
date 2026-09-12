import type { Block } from 'payload'

import { eyebrowField, headingField, introField } from '@/fields/common'

export const FormBlock: Block = {
  slug: 'formBlock',
  interfaceName: 'FormBlock',
  fields: [
    eyebrowField(),
    headingField(),
    introField(),
    {
      name: 'form',
      type: 'relationship',
      relationTo: 'forms',
      required: true,
      admin: {
        description:
          'Build and edit forms under "Forms". Submissions appear under "Form Submissions".',
      },
    },
    {
      name: 'showContactDetails',
      type: 'checkbox',
      defaultValue: false,
      label: 'Show contact details (from Site Settings) beside the form',
    },
  ],
  graphQL: {
    singularName: 'FormBlock',
  },
  labels: {
    plural: 'Forms',
    singular: 'Form',
  },
}
