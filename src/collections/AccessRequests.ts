import type { CollectionConfig } from 'payload'

import { isSuperAdmin, superAdminOnly } from '../access/roles'
import { COMPANY_EMAIL_DOMAIN } from '../security/constants'
import { provisionApprovedUser } from '../security/provision'

/**
 * Requests to be given an admin account. Created only by the gate's request form
 * (server-side), and approved only by a super admin — until then the person cannot sign in,
 * because no account exists for their address.
 */
export const AccessRequests: CollectionConfig = {
  slug: 'access-requests',
  labels: { singular: 'Access request', plural: 'Access requests' },
  access: {
    create: () => false, // only the server, through the gate
    read: superAdminOnly,
    update: superAdminOnly,
    delete: superAdminOnly,
  },
  admin: {
    group: 'Administration',
    defaultColumns: ['email', 'name', 'status', 'createdAt'],
    description: `People asking for an admin account. Approving one creates their account and emails them a link to set a password. Only @${COMPANY_EMAIL_DOMAIN} addresses can ask.`,
    useAsTitle: 'email',
    hidden: ({ user }) => !isSuperAdmin(user as never),
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'email', type: 'email', required: true, index: true, admin: { readOnly: true } },
    { name: 'name', type: 'text', admin: { readOnly: true } },
    { name: 'message', type: 'textarea', admin: { readOnly: true } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Waiting for your decision', value: 'pending' },
        { label: 'Approved — account created', value: 'approved' },
        { label: 'Declined', value: 'declined' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Set to “Approved” to create this person’s account as an editor. They receive an email to set their own password.',
      },
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'editor',
      options: [
        { label: 'Editor — content only', value: 'editor' },
        { label: 'Super admin — everything, including users', value: 'super-admin' },
      ],
      admin: { position: 'sidebar', description: 'What the account can do once approved.' },
    },
    {
      name: 'decidedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
    { name: 'decidedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'ip', type: 'text', admin: { readOnly: true, hidden: true } },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req, operation }) => {
        if (operation === 'update' && data.status && data.status !== originalDoc?.status) {
          data.decidedBy = req.user?.id ?? null
          data.decidedAt = new Date().toISOString()
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        const becameApproved =
          operation === 'update' && doc.status === 'approved' && previousDoc?.status !== 'approved'
        if (becameApproved) await provisionApprovedUser({ request: doc, req })
        return doc
      },
    ],
  },
  timestamps: true,
}
