import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../hooks/revalidateFrontend'

/** Leadership and team profiles, shown by the "People grid" block. */
export const People: CollectionConfig = {
  slug: 'people',
  labels: {
    singular: 'Person',
    plural: 'People',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'role', 'order'],
    group: 'Group',
    useAsTitle: 'name',
  },
  defaultSort: 'order',
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, admin: { width: '50%' } },
        { name: 'role', type: 'text', required: true, admin: { width: '50%' } },
      ],
    },
    {
      name: 'portrait',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Portrait orientation works best. Without one, the person’s initials are shown.',
      },
    },
    {
      name: 'bio',
      type: 'textarea',
    },
    {
      name: 'links',
      type: 'array',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', required: true, admin: { width: '40%' } },
            { name: 'url', type: 'text', required: true, admin: { width: '60%' } },
          ],
        },
      ],
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 10,
      admin: {
        position: 'sidebar',
        description: 'Lower numbers appear first.',
      },
    },
  ],
  hooks: {
    afterChange: [revalidateFrontend],
    afterDelete: [revalidateFrontendAfterDelete],
  },
}
