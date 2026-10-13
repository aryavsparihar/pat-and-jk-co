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
  'staff-signed-in',
  'staff-sign-in-failed',
  'staff-locked',
  // Members (artists and partners)
  'member-code-requested',
  'member-code-sent',
  'member-code-failed',
  'member-code-rate-limited',
  'member-locked',
  'member-blocked',
  'member-created',
  'member-signed-in',
  'member-signed-out',
  'member-signed-out-everywhere',
  'member-id-issued',
  'application-submitted',
  'application-approved',
  'application-rejected',
  'application-changes-requested',
  'application-reopened',
  'application-reapply-allowed',
  // Identity and bank details
  'kyc-saved',
  'kyc-revealed',
  'kyc-document-opened',
  'kyc-bank-change-requested',
  'kyc-bank-change-cancelled',
  'kyc-bank-change-approved',
  'kyc-payout-details-requested',
  'kyc-consent-withdrawn',
  'kyc-purged',
  'data-request',
  'kyc-legal-hold-changed',
  'kyc-aadhaar-checked',
  'portal-approved',
  'portal-changes-requested',
  'member-email-changed',
  'member-session-ended',
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
    defaultColumns: ['event', 'email', 'subject', 'actor', 'createdAt'],
    description:
      'Every sign-in attempt, access request and decision on a member, staff and members alike. Read-only.',
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
    {
      // The member ID or application reference the event is about
      name: 'subject',
      type: 'text',
      index: true,
    },
    {
      // The member of staff who did it, for decisions taken in the admin
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
    },
  ],
  timestamps: true,
}
