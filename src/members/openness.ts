import type { Payload } from 'payload'

import type { SiteSetting } from '@/payload-types'

/**
 * Whether applications are open: Site settings → Applications, on the default brand. Off by
 * default, so a new deploy never opens applications by itself. While closed, the application
 * pages show a note and the server refuses to start or send an application; signing in to an
 * existing account still works.
 */

export const DEFAULT_CLOSED_NOTE = 'Applications open soon. Please come back in a little while.'

export type Openness = { open: boolean; note: string }

/** The default brand's Site settings, where the application settings live */
export const defaultSiteSettings = async (payload: Payload): Promise<SiteSetting | null> =>
  (
    await payload.find({
      collection: 'site-settings',
      where: { 'tenant.slug': { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] ?? null

export const applicationsOpenness = async (payload: Payload): Promise<Openness> => {
  const settings = await defaultSiteSettings(payload)
  // On a developer's machine only, DEV_APPLICATIONS_OPEN=1 opens applications without touching
  // the shared database's switch. Ignored in any production build, previews included
  const devOpen =
    process.env.NODE_ENV === 'development' && process.env.DEV_APPLICATIONS_OPEN === '1'
  return {
    open: devOpen || settings?.applicationsOpen === true,
    note: settings?.applicationsClosedNote?.trim() || DEFAULT_CLOSED_NOTE,
  }
}

/** The reply an endpoint gives while applications are closed */
export const closedReply = (note: string) =>
  Response.json(
    { message: note, closed: true },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  )
