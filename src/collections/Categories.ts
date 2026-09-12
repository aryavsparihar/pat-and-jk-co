import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { tenantSlugField } from '../fields/slug'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../hooks/revalidateFrontend'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Journal category',
    plural: 'Journal categories',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Website',
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    tenantSlugField('categories'),
  ],
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  hooks: {
    afterChange: [revalidateFrontend],
    afterDelete: [revalidateFrontendAfterDelete],
  },
}
