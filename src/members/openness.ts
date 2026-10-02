import type { Payload } from 'payload'

/**
 * Whether applications are open: Site settings → Applications, on the default brand. Off by
 * default, so a new deploy never opens applications by itself. While closed, the application
 * pages show a note and the server refuses to start or send an application; signing in to an
 * existing account still works.
 */

export const DEFAULT_CLOSED_NOTE = 'Applications open soon. Please come back in a little while.'

export type Openness = { open: boolean; note: string }

export const applicationsOpenness = async (payload: Payload): Promise<Openness> => {
  const found = await payload.find({
    collection: 'site-settings',
    where: { 'tenant.slug': { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const settings = found.docs[0]
  return {
    open: settings?.applicationsOpen === true,
    note: settings?.applicationsClosedNote?.trim() || DEFAULT_CLOSED_NOTE,
  }
}

/** The reply an endpoint gives while applications are closed */
export const closedReply = (note: string) =>
  Response.json(
    { message: note, closed: true },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  )
