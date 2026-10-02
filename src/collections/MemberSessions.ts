import type { CollectionConfig } from 'payload'

/**
 * One row per signed-in browser of a member (src/security/memberSession.ts). Written and read
 * only by the server: every API rule is `false`. Holds a keyed hash of the session secret, never
 * the secret itself, and a coarse device name ("Safari on macOS") so a member can recognise their
 * sessions; no IP address is kept.
 */
export const MemberSessions: CollectionConfig = {
  slug: 'member-sessions',
  labels: { singular: 'Member session', plural: 'Member sessions' },
  access: {
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: { hidden: true },
  fields: [
    { name: 'member', type: 'relationship', relationTo: 'members', required: true, index: true },
    { name: 'sid', type: 'text', required: true, unique: true },
    { name: 'secretHash', type: 'text', required: true },
    { name: 'device', type: 'text' },
    { name: 'lastSeenAt', type: 'date', required: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'absoluteExpiresAt', type: 'date', required: true },
    { name: 'revokedAt', type: 'date', index: true },
    { name: 'revokedReason', type: 'text' },
  ],
  timestamps: true,
}
