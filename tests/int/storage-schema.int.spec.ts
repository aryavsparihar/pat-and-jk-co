import { describe, expect, it } from 'vitest'

import config from '@/payload.config'

/*
 * The Blob storage plugin is enabled only where BLOB_READ_WRITE_TOKEN is set (on Vercel), but
 * migrations are generated locally, without it. Its fields must exist either way, or the deployed
 * code queries columns the migrations never created: portfolio_images.prefix was one, and every
 * portfolio upload on a deployment failed.
 */
describe('the storage plugin’s fields', () => {
  it('are in the schema even where storage is not enabled', async () => {
    expect(process.env.BLOB_READ_WRITE_TOKEN).toBeFalsy()
    const sanitized = await config
    for (const slug of ['media', 'portfolio-images']) {
      const collection = sanitized.collections.find((c) => c.slug === slug)!
      const names = collection.flattenedFields.map((f) => f.name)
      expect(names, slug).toContain('prefix')
    }
  })
})
