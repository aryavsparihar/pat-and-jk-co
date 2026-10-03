import type { CollectionConfig } from 'payload'

/**
 * One-time sign-in codes, for staff (the admin gate) and members alike, from one
 * implementation (src/security/challenges.ts). Written and read only by the server; every
 * access rule is `false`, so no API request can list, read or alter them. Codes are stored
 * as keyed hashes, never in the clear.
 *
 * The audience is checked on every verification, so a code issued at the staff gate can never
 * be spent on a member sign-in, or the other way round.
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
    {
      name: 'audience',
      type: 'select',
      defaultValue: 'staff',
      required: true,
      index: true,
      options: [
        { label: 'Staff (admin gate)', value: 'staff' },
        { label: 'Member', value: 'member' },
      ],
    },
    {
      // What verifying the code will do: sign an existing member in, or start an application
      name: 'purpose',
      type: 'select',
      options: [
        { label: 'Sign in', value: 'signin' },
        { label: 'Apply as an artist', value: 'apply-artist' },
        { label: 'Apply as a partner', value: 'apply-partner' },
        // A fresh code inside a session, before something sensitive (changing bank details)
        { label: 'Confirm a sensitive change', value: 'step-up' },
        { label: 'Confirm a new email address', value: 'email-change' },
      ],
    },
  ],
}
