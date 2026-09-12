import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { superAdminOnly, superAdminOnlyField, superAdminOrSelf } from '../../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: superAdminOnly,
    delete: superAdminOnly,
    read: superAdminOrSelf,
    update: superAdminOrSelf,
  },
  admin: {
    defaultColumns: ['name', 'email', 'roles'],
    group: 'Administration',
    useAsTitle: 'name',
  },
  auth: {
    // Sessions last a week, then the user signs in again
    tokenExpiration: 60 * 60 * 24 * 7,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      // The first account is always the super admin (also enforced in the beforeChange hook below)
      defaultValue: async ({ req }) => {
        const { totalDocs } = await req.payload.count({ collection: 'users', req })
        return totalDocs === 0 ? ['super-admin'] : ['editor']
      },
      required: true,
      saveToJWT: true,
      options: [
        { label: 'Super admin (all brands, users & domains)', value: 'super-admin' },
        { label: 'Editor (content for assigned brands)', value: 'editor' },
      ],
      access: {
        // Only super admins may grant or change roles — prevents privilege escalation
        create: superAdminOnlyField,
        update: superAdminOnlyField,
      },
      admin: {
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    beforeChange: [
      // The very first account (created on the admin's welcome screen) becomes the super admin,
      // so no credentials ever need to be hard-coded or seeded.
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const { totalDocs } = await req.payload.count({ collection: 'users', req })
        if (totalDocs === 0) data.roles = ['super-admin']
        return data
      },
    ],
  },
  timestamps: true,
}
