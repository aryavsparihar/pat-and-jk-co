import type { PayloadRequest, SanitizedConfig } from 'payload'

import { isStaff } from './roles'

/**
 * One guard over every collection, so that a signed-in member can never do more than a visitor.
 *
 * Our own access rules ask `isStaff`, but not every rule is ours. Payload's default for an action
 * with no rule is "anyone signed in", and its internal collections (preferences, locked
 * documents, folders, the job queue, the key-value store) and the form builder's `forms` rely on
 * it. A member is "signed in", so without this they could create forms, delete media folders,
 * queue jobs or read which documents staff are editing.
 *
 * The guard wraps every access function after Payload has assembled the full configuration,
 * internal collections included, and applies one rule: if the user is signed in but is not staff,
 * evaluate the original rule as though nobody were signed in. Public reads keep working (a member
 * sees published pages like anyone else); everything a visitor cannot do, a member cannot do.
 * Admin-panel access is refused outright.
 *
 * Collections built for members (their own record, application, artworks) are listed in
 * MEMBER_COLLECTIONS and keep their own rules, which must decide for themselves what a member
 * may touch.
 */
export const MEMBER_COLLECTIONS = new Set<string>(['members', 'applications', 'portfolio-images'])

type AccessFn = (args: { req: PayloadRequest } & Record<string, unknown>) => unknown

const signedInOutsider = (req: PayloadRequest | undefined): boolean =>
  Boolean(req?.user) && !isStaff(req?.user)

/**
 * The same request with nobody signed in. A proxy rather than a copy, so everything else on it
 * (headers, payload, transaction, locale) is exactly what the original rule would have seen.
 */
const asVisitor = (req: PayloadRequest): PayloadRequest =>
  new Proxy(req, {
    get(target, prop) {
      if (prop === 'user') return null
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })

const guard = (original: AccessFn, { deny }: { deny: boolean }): AccessFn => {
  const guarded: AccessFn = (args) => {
    if (!signedInOutsider(args.req)) return original(args)
    if (deny) return false
    return original({ ...args, req: asVisitor(args.req) })
  }
  return guarded
}

/** Applied to the sanitized config in payload.config.ts. Mutates and returns it. */
export const guardMemberAccess = (config: SanitizedConfig): SanitizedConfig => {
  for (const collection of config.collections) {
    if (MEMBER_COLLECTIONS.has(collection.slug)) continue
    const access = collection.access as unknown as Record<string, AccessFn | undefined>
    for (const [action, fn] of Object.entries(access)) {
      if (typeof fn !== 'function') continue
      access[action] = guard(fn, { deny: action === 'admin' })
    }
  }

  for (const global of config.globals) {
    const access = global.access as unknown as Record<string, AccessFn | undefined>
    for (const [action, fn] of Object.entries(access)) {
      if (typeof fn === 'function') access[action] = guard(fn, { deny: false })
    }
  }

  // Payload's own preferences endpoints (the admin panel's saved layouts) are for staff only.
  // Called by a member they would fail inside Payload with a server error, as preferences only
  // know staff accounts; refuse them plainly first
  const preferences = config.collections.find((c) => c.slug === 'payload-preferences')
  if (preferences && Array.isArray(preferences.endpoints)) {
    // Copies: Payload shares its default endpoint objects between collections
    preferences.endpoints = preferences.endpoints.map((endpoint) => ({
      ...endpoint,
      handler: (req) =>
        signedInOutsider(req)
          ? Response.json(
              { errors: [{ message: 'You are not allowed to do that.' }] },
              { status: 403 },
            )
          : endpoint.handler(req),
    }))
  }

  // The job queue: only staff (or the cron secret, checked inside the rule) may touch it
  const jobAccess = config.jobs?.access as unknown as Record<string, AccessFn | undefined>
  if (jobAccess) {
    for (const [action, fn] of Object.entries(jobAccess)) {
      if (typeof fn === 'function') jobAccess[action] = guard(fn, { deny: true })
    }
  }

  return config
}
