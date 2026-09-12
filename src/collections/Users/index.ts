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
      defaultValue: ['editor'],
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
  timestamps: true,
}
