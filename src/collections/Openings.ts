import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../hooks/revalidateFrontend'

/** Open calls for artists, collaborators, partners and roles — shown by the "Openings list" block. */
export const Openings: CollectionConfig = {
  slug: 'openings',
  labels: {
    singular: 'Opening',
    plural: 'Openings',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    // Visitors only ever see open calls; signed-in editors see everything
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'open' } }),
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'type', 'status', 'order'],
    group: 'Ventures & people',
    description:
      'Open calls shown on the Collaborate page. Set one to “Closed” to hide it without deleting it.',
    useAsTitle: 'title',
  },
  defaultSort: 'order',
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          defaultValue: 'collaborator',
          required: true,
          admin: { width: '50%' },
          options: [
            { label: 'Artist call', value: 'artist' },
            { label: 'Collaborator', value: 'collaborator' },
            { label: 'Partnership', value: 'partner' },
            { label: 'Role', value: 'role' },
          ],
        },
        {
          name: 'commitment',
          type: 'text',
          admin: { width: '50%', description: 'e.g. "Part-time · Remote"' },
        },
      ],
    },
    {
      name: 'summary',
      type: 'textarea',
      required: true,
    },
    {
      name: 'applyLabel',
      type: 'text',
      defaultValue: 'Express interest',
    },
    {
      name: 'applyUrl',
      type: 'text',
      defaultValue: '/contact',
      admin: {
        description: 'Where the button leads — usually /contact or /collaborate#form.',
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'open',
      required: true,
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Closed', value: 'closed' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 10,
      admin: { position: 'sidebar', description: 'Lower numbers appear first.' },
    },
  ],
  hooks: {
    afterChange: [revalidateFrontend],
    afterDelete: [revalidateFrontendAfterDelete],
  },
}
