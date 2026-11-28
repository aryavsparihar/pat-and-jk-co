import type { Metadata } from 'next'

import { generateMeta } from '@/utilities/meta'
import { getTenantContext } from '@/utilities/tenant'

/**
 * Metadata for a page built in code from the founder's designs: its title and description,
 * with the canonical address and share image every other page has.
 */
export const houseMetadata = async (
  host: string,
  path: string,
  title: string,
  description: string,
): Promise<Metadata> => {
  const ctx = await getTenantContext(host)
  return generateMeta({
    ctx,
    doc: { title, meta: { title: path === '/' ? title : undefined, description } },
    path,
  })
}
