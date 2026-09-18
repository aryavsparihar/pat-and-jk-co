import type { CollectionConfig } from 'payload'

import { isSuperAdmin, superAdminOnly } from '../access/roles'

export const securityEventTypes = [
  'code-requested',
  'code-sent',
  'code-failed',
  'code-verified',
  'code-rate-limited',
  'access-requested',
  'access-approved',
  'access-declined',
  'login-blocked',
] as const

/**
 * An append-only record of everything that happens at the admin gate. Visible to super
 * admins, and writable only by the server, so it cannot be edited to hide an attempt.
 */
export const SecurityEvents: CollectionConfig = {
  slug: 'security-events',
  labels: { singular: 'Security event', plural: 'Security log' },
  access: {
    create: () => false,
    read: superAdminOnly,
    update: () => false,
    delete: () => false,
  },
  admin: {
    group: 'Administration',
    defaultColumns: ['event', 'email', 'ip', 'createdAt'],
    description: 'Every sign-in attempt and access request. Read-only.',
    hidden: ({ user }) => !isSuperAdmin(user as never),
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'event',
      type: 'select',
      required: true,
      index: true,
      options: securityEventTypes.map((value) => ({ label: value, value })),
    },
    { name: 'email', type: 'text', index: true },
    { name: 'ip', type: 'text' },
    { name: 'detail', type: 'text' },
  ],
  timestamps: true,
}
