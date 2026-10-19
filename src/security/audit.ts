import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  FlattenedField,
  Plugin,
  PayloadRequest,
  SanitizedCollectionConfig,
} from 'payload'

/**
 * Every record added, changed or deleted, in every collection, goes in the security log, with
 * who did it: a member of staff in the admin, a member from their account, or the site itself.
 * The specific events (an application approved, KYC revealed, a standing changed) say why; these
 * say what, so nothing that adds to, changes or removes the site's records is missing from the log.
 *
 * Only field names are written, never what was typed: the log must not become a second copy of
 * anyone's details. Choices (a stage, a status, a role, yes or no) are safe to show, so for those
 * the change is shown as "from → to".
 *
 * Left out, because they are bookkeeping that already has its own entries or none worth keeping:
 * the log itself, sign-in codes, rate limits, member sessions, the visitor count, and Payload's
 * own tables (preferences, locks, jobs, migrations). Drafts saved or autosaved while someone types
 * are left out too, as the live page does not change; creating, publishing and deleting are not.
 */
const NOT_AUDITED = new Set([
  'security-events',
  'login-challenges',
  'rate-limits',
  'member-sessions',
  'visitor-counts',
])

/** Bookkeeping fields that change by themselves, and secrets that must not even be named */
const NOT_COMPARED = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'hash',
  'salt',
  'sessions',
  'loginAttempts',
  'lockUntil',
  'resetPasswordToken',
  'resetPasswordExpiration',
  '_verificationToken',
  '_status',
])

/** Fields worked out from others on every save, per collection: the others are compared instead */
const DERIVED: Record<string, Set<string>> = {
  // Members' title is their email, or the placeholder once deleted
  members: new Set(['title']),
}

/** Values that are a choice from a list, safe to show in the log as "from → to" */
const SHOWN_TYPES = new Set(['select', 'radio', 'checkbox'])

type Actor = { id?: number; email?: string; collection?: string } | null | undefined

const by = (user: Actor) =>
  user?.collection === 'users'
    ? `by ${user.email ?? `staff ${user.id}`}`
    : user?.collection === 'members'
      ? 'by the member, from their account'
      : 'by the site'

const idOf = (value: unknown): unknown =>
  value && typeof value === 'object' && 'id' in value ? (value as { id: unknown }).id : value

/** A relationship's value as ids only, however deeply it was read */
const normalise = (field: FlattenedField, value: unknown): unknown => {
  if (field.type === 'relationship' || field.type === 'upload') {
    if (Array.isArray(value)) return value.map((v) => idOf((v as { value?: unknown })?.value ?? v))
    return idOf((value as { value?: unknown } | null)?.value ?? value) ?? null
  }
  return value ?? null
}

const labelOf = (field: FlattenedField) =>
  typeof (field as { label?: unknown }).label === 'string'
    ? ((field as { label: string }).label as string)
    : field.name

const show = (value: unknown) =>
  value === null || value === undefined || value === ''
    ? 'none'
    : Array.isArray(value)
      ? value.join(', ') || 'none'
      : String(value)

/** "Stage: draft → submitted; Phone; Postal address": what changed, never what it says now */
export const describeChanges = (
  fields: FlattenedField[],
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  derived: Set<string> = new Set(),
): string[] => {
  const changes: string[] = []
  for (const field of fields) {
    if (!('name' in field) || NOT_COMPARED.has(field.name) || derived.has(field.name)) continue
    const was = normalise(field, before?.[field.name])
    const now = normalise(field, after[field.name])
    if (JSON.stringify(was) === JSON.stringify(now)) continue
    changes.push(
      SHOWN_TYPES.has(field.type)
        ? `${labelOf(field)}: ${show(was)} → ${show(now)}`
        : labelOf(field),
    )
  }
  return changes
}

const singular = (collection: SanitizedCollectionConfig) => {
  const label = collection.labels?.singular
  return typeof label === 'string' ? label : collection.slug
}

/**
 * Who and what the entry is about: the person's address and member IDs where the record is a
 * person's, so a member's record lists it among their own entries (MemberLogPanel)
 */
const aboutOf = async (
  collection: SanitizedCollectionConfig,
  doc: Record<string, unknown>,
  req: PayloadRequest,
): Promise<{ email?: string; subject: string; name: string }> => {
  const ids = (m: { artistId?: unknown; partnerId?: unknown }) =>
    [m.artistId, m.partnerId].filter(Boolean).join(' · ')
  const fallback = `${collection.slug} ${String(doc.id)}`
  switch (collection.slug) {
    case 'members': {
      const memberIds = ids(doc)
      return {
        email: doc.email as string | undefined,
        subject: memberIds || fallback,
        name: memberIds || `member ${String(doc.id)}`,
      }
    }
    case 'users':
      return {
        email: doc.email as string | undefined,
        subject: (doc.staffRef as string | undefined) || fallback,
        name: (doc.staffRef as string | undefined) || `staff ${String(doc.id)}`,
      }
    case 'applications':
    case 'kyc-records':
    case 'kyc-documents':
    case 'portfolio-images': {
      // Someone's own record: under their address too, so it is listed with their entries and
      // the address is replaced if they are ever deleted (src/people/erase.ts)
      const ownerId = idOf(doc.member ?? doc.owner)
      const owner =
        typeof ownerId === 'number'
          ? await req.payload
              .findByID({
                collection: 'members',
                id: ownerId,
                depth: 0,
                overrideAccess: true,
                req,
                select: { email: true, artistId: true, partnerId: true },
              })
              .catch(() => null)
          : null
      const memberIds = owner ? ids(owner) : ''
      const reference = doc.reference as string | undefined
      if (reference) return { email: owner?.email, subject: reference, name: reference }
      return {
        email: owner?.email,
        subject: memberIds || fallback,
        name: `${String(doc.kind ?? doc.id)}${memberIds ? ` of ${memberIds}` : ''}`,
      }
    }
    default: {
      const titleField = collection.admin?.useAsTitle
      const title = titleField && titleField !== 'id' ? doc[titleField] : null
      return {
        subject: fallback,
        name: typeof title === 'string' && title ? `“${title.slice(0, 80)}”` : String(doc.id),
      }
    }
  }
}

/**
 * For a write the server makes on someone's behalf without signing in as them (overrideAccess):
 * who asked, so the log names them rather than "the site". Goes in the write's `context`.
 */
export const actingFor = (
  who: { id?: number | null; email?: string | null },
  collection: 'members' | 'users',
) => ({ auditActor: { id: who.id ?? undefined, email: who.email ?? undefined, collection } })

const actorOf = (req: PayloadRequest, context: Record<string, unknown> | undefined): Actor =>
  (req.user as Actor) ?? (context?.auditActor as Actor)

const write = async (
  req: PayloadRequest,
  event: 'record-created' | 'record-changed' | 'record-deleted',
  about: { email?: string; subject: string },
  detail: string,
  user: Actor,
) => {
  const { logSecurityEvent } = await import('./events')
  const { clientIp } = await import('./constants')
  await logSecurityEvent(req.payload, {
    event,
    email: about.email ?? (user?.collection === 'users' ? user.email : undefined),
    ip: req.headers ? clientIp(req.headers) : undefined,
    subject: about.subject.slice(0, 200),
    actor: user?.collection === 'users' ? (user.id ?? null) : null,
    detail,
    req,
  })
}

const afterChange: CollectionAfterChangeHook = async ({
  collection,
  doc,
  previousDoc,
  operation,
  req,
  context,
}) => {
  // Deleting someone writes its own full entry (src/people/erase.ts)
  if (context?.erasing || context?.skipAudit) return doc
  const drafts = Boolean(
    collection.versions && (collection.versions as { drafts?: unknown }).drafts,
  )
  // A draft saved, or autosaved while someone is still typing: the live page is unchanged until
  // it is published, which is logged
  if (drafts && operation === 'update' && doc._status === 'draft') return doc
  try {
    const user = actorOf(req, context)
    const about = await aboutOf(collection, doc, req)
    const what = `${singular(collection)} ${about.name}`
    if (operation === 'create') {
      await write(
        req,
        'record-created',
        about,
        `${what} added${drafts && doc._status === 'draft' ? ' as a draft' : ''} ${by(user)}`,
        user,
      )
      return doc
    }
    const changes = describeChanges(
      collection.flattenedFields,
      previousDoc,
      doc,
      DERIVED[collection.slug],
    )
    // Publishing is always worth an entry, even when the draft it publishes was already compared
    if (drafts) changes.unshift('published')
    if (changes.length === 0) return doc
    await write(
      req,
      'record-changed',
      about,
      `${what} changed ${by(user)}: ${changes.join('; ')}`,
      user,
    )
  } catch (error) {
    // The log must never stop a save
    req.payload.logger.error({ err: error, msg: `Could not log a change to ${collection.slug}` })
  }
  return doc
}

const afterDelete: CollectionAfterDeleteHook = async ({ collection, doc, req, context }) => {
  if (context?.erasing || context?.skipAudit) return doc
  try {
    const user = actorOf(req, context)
    const about = await aboutOf(collection, doc, req)
    await write(
      req,
      'record-deleted',
      about,
      `${singular(collection)} ${about.name} deleted ${by(user)}`,
      user,
    )
  } catch (error) {
    req.payload.logger.error({
      err: error,
      msg: `Could not log a deletion from ${collection.slug}`,
    })
  }
  return doc
}

const audited = (collection: CollectionConfig): CollectionConfig => ({
  ...collection,
  hooks: {
    ...collection.hooks,
    afterChange: [...(collection.hooks?.afterChange ?? []), afterChange],
    afterDelete: [...(collection.hooks?.afterDelete ?? []), afterDelete],
  },
})

/** Last in the plugin list, so it reaches the collections other plugins add (forms, redirects) */
export const auditTrail = (): Plugin => (config) => ({
  ...config,
  collections: (config.collections ?? []).map((collection) =>
    NOT_AUDITED.has(collection.slug) || collection.slug.startsWith('payload-')
      ? collection
      : audited(collection),
  ),
})
