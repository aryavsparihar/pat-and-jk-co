import type { CollectionConfig } from 'payload'

/**
 * Counters behind every rate limit (see `src/security/rateLimit.ts`). Kept in Postgres because
 * each serverless instance has its own memory: a limit held in memory is a limit per instance,
 * which is no limit at all.
 *
 * Written and read only by the server with a single atomic SQL statement; every API rule is
 * `false`. Keys are keyed hashes, so the table holds no addresses or IPs.
 */
export const RateLimits: CollectionConfig = {
  slug: 'rate-limits',
  labels: { singular: 'Rate limit', plural: 'Rate limits' },
  access: {
    create: () => false,
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: { hidden: true },
  timestamps: false,
  fields: [
    { name: 'key', type: 'text', required: true, unique: true },
    { name: 'windowStart', type: 'date', required: true, index: true },
    { name: 'hits', type: 'number', required: true, defaultValue: 0 },
  ],
}
