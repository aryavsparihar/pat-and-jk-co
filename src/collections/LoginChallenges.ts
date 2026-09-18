import type { CollectionConfig } from 'payload'

/**
 * One-time sign-in codes. Written and read only by the server (the admin gate); every
 * access rule is `false`, so no API request can list, read or alter them. Codes are stored
 * as keyed hashes, never in the clear.
 */
export const LoginChallenges: CollectionConfig = {
  slug: 'login-challenges',
  labels: { singular: 'Sign-in code', plural: 'Sign-in codes' },
  access: {
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: { hidden: true },
  fields: [
    { name: 'email', type: 'text', required: true, index: true },
    { name: 'codeHash', type: 'text', required: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'attempts', type: 'number', defaultValue: 0 },
    { name: 'consumedAt', type: 'date' },
    { name: 'ip', type: 'text' },
    // False for an address with no active account: a challenge is still created so the
    // response looks identical either way, and no one can tell which addresses exist.
    { name: 'deliverable', type: 'checkbox', defaultValue: false },
  ],
}
