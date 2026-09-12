import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload'

import { revalidatePath } from 'next/cache'

/**
 * Every public page is statically rendered and cached. Whenever content changes in the
 * admin panel we purge the whole frontend cache so the next visitor sees the update —
 * no redeploy, no code change.
 *
 * Purging everything (rather than individual paths) is deliberate: brand sites are small,
 * and blocks like "Latest from the journal" or "Ventures grid" surface content on many
 * pages at once, so precise invalidation would be fragile for very little gain.
 */
const purge = (req: PayloadRequest) => {
  if (req.context.disableRevalidate) return
  try {
    revalidatePath('/', 'layout')
  } catch (err) {
    // revalidatePath throws outside a Next.js request (e.g. in the seed script) — safe to ignore
    req.payload.logger.debug({ err, msg: 'Skipped frontend revalidation' })
  }
}

export const revalidateFrontend: CollectionAfterChangeHook = ({ doc, req }) => {
  purge(req)
  return doc
}

export const revalidateFrontendAfterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
  purge(req)
  return doc
}
