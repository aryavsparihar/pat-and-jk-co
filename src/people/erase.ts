import { sql } from '@payloadcms/db-postgres'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import { isSuperAdmin } from '@/access/roles'
import { memberIdsOf } from '@/collections/Members'
import type { PublishedArtwork } from '@/members/artworks'
import type { Artwork, Member, User } from '@/payload-types'
import { normaliseEmail } from '@/security/constants'
import { logSecurityEvent } from '@/security/events'
import { execute, executeIn } from '@/utilities/sql'

import { blankOf } from './blank'

/**
 * Deleting someone: their personal details are erased, and their records stay, so nothing that
 * points at them ever breaks and no ID is ever handed out again (docs/SECURITY.md, "Deleting
 * someone"). One way in for every route: the admin's "Delete this person", and a member's own
 * deletion request, which staff carry out the same way.
 *
 * For a member (artist, partner or applicant):
 *   - the member record keeps only its IDs, dates and standing; everything else is emptied, the
 *     email becomes an address that cannot receive mail, and it is shown as "Deleted artist
 *     (AT000012)" wherever it is linked
 *   - their applications keep their reference, kind, stage, dates and decisions; every answer
 *     they gave is emptied
 *   - works staff approved are archived and kept, with their pictures and approved snapshot, as
 *     the record of what was shown; works never approved are removed, and every other picture
 *     of theirs (portrait, application portfolio) is deleted with its file
 *   - identity and payout details (KYC) are purged, files included, with the existing purge,
 *     unless a legal hold is set, when they stay encrypted until it ends and the reason is kept
 *   - sessions, sign-in codes and contact-form messages from their addresses are deleted
 *   - the security log keeps every entry, with their addresses replaced by the placeholder
 *
 * A member of staff keeps their account record as "Deleted staff (ST-0007)": name, address,
 * password, sessions and brands are erased, and they can never sign in. Nobody can delete
 * themselves, or the last super admin.
 *
 * The database writes happen in one transaction, so a failure leaves nothing half-done; KYC is
 * purged first, on its own, as the weekly purge does. The person is emailed only once it is done.
 */

export class ErasureError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
    this.name = 'ErasureError'
  }
}

export const MIN_ERASURE_REASON = 10

/** Addresses that can never receive mail (RFC 2606), so an erased record holds nobody's */
const ERASED_DOMAIN = 'erased.invalid'

export const memberPlaceholder = (
  member: Pick<Member, 'id' | 'artistId' | 'partnerId'>,
  reference?: string | null,
): string => {
  if (member.artistId && member.partnerId)
    return `Deleted member (${member.artistId} · ${member.partnerId})`
  if (member.artistId) return `Deleted artist (${member.artistId})`
  if (member.partnerId) return `Deleted partner (${member.partnerId})`
  return `Deleted applicant (${reference || `#${member.id}`})`
}

export const staffPlaceholder = (staffRef: string) => `Deleted staff (${staffRef})`

/** What staff type to confirm: the ID or reference they see on the record */
export const memberConfirmation = (
  member: Pick<Member, 'artistId' | 'partnerId' | 'email'>,
  reference?: string | null,
) => member.artistId || member.partnerId || reference || member.email

const unique = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v)).map(normaliseEmail))].filter(Boolean)

const reasonOf = (reason: unknown) => {
  const why = String(reason ?? '').trim()
  if (why.length < MIN_ERASURE_REASON) {
    throw new ErasureError('Please give the reason, in a few words.')
  }
  return why.slice(0, 1000)
}

/** Replaces the addresses with the placeholder in the security log; the entries all stay */
const eraseFromLog = async (
  payload: Payload,
  req: PayloadRequest,
  addresses: string[],
  placeholder: string,
) => {
  if (!addresses.length) return 0
  const list = sql.join(
    addresses.map((a) => sql`${a}`),
    sql`, `,
  )
  const [row] = await executeIn<{ changed: number }>(
    payload,
    req,
    sql`SELECT public.erase_from_security_log(ARRAY[${list}]::text[], ${placeholder}) AS changed`,
  )
  return Number(row?.changed ?? 0)
}

const withTransaction = async <T>(payload: Payload, work: (req: PayloadRequest) => Promise<T>) => {
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    const result = await work(req)
    await commitTransaction(req)
    return result
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

const idOf = (value: unknown): number | null =>
  typeof value === 'number' ? value : ((value as { id?: number } | null)?.id ?? null)

/* ─── Members ───────────────────────────────────────────────────────────── */

export type MemberErasure = {
  placeholder: string
  source: 'admin' | 'data-request'
  /** What the law makes us keep, in words for the person, or null */
  kept: string | null
  kyc: 'purged' | 'kept' | 'none'
  worksArchived: number
  worksRemoved: number
  picturesDeleted: number
  applications: number
  logEntries: number
  emailed: boolean
}

/** On a member: what is kept, and what every other field is emptied to */
const MEMBER_KEEP = new Set([
  'id',
  'email',
  'title',
  'artistId',
  'partnerId',
  'standing',
  'partnerCategory',
  'artistApprovedAt',
  'partnerApprovedAt',
  'erasure',
  'deletionRequest',
  'createdAt',
  'updatedAt',
])

/** On an application: the record of what happened, never what they wrote */
const APPLICATION_KEEP = new Set([
  'id',
  'reference',
  'member',
  'type',
  'issuedId',
  'stage',
  'withdrawnAt',
  'previousApplication',
  'currentSlot',
  'partnerCategory',
  'submittedAt',
  'decidedAt',
  'reapplyFrom',
  'decidedBy',
  'declarations',
  'completedSteps',
  'rounds',
  'createdAt',
  'updatedAt',
])

export const eraseMember = async (
  payload: Payload,
  {
    memberId,
    actor,
    reason,
    confirm,
  }: { memberId: number; actor: User | null | undefined; reason: unknown; confirm: unknown },
): Promise<MemberErasure> => {
  if (!actor || !isSuperAdmin(actor)) {
    throw new ErasureError('Only a super admin can delete someone.', 403)
  }
  const why = reasonOf(reason)
  const member = (await payload
    .findByID({
      collection: 'members',
      id: memberId,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    .catch(() => null)) as Member | null
  if (!member) throw new ErasureError('There is no such member.', 404)
  if (member.erasure?.at || member.standing === 'erased') {
    throw new ErasureError('This person has already been deleted.', 409)
  }

  const applications = (
    await payload.find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      sort: '-createdAt',
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
      showHiddenFields: true,
    })
  ).docs
  const reference = applications[0]?.reference ?? null
  const expected = memberConfirmation(member, reference)
  if (
    String(confirm ?? '')
      .trim()
      .toUpperCase() !== expected.toUpperCase()
  ) {
    throw new ErasureError(`To confirm, type ${expected} exactly.`)
  }
  const placeholder = memberPlaceholder(member, reference)
  const source: MemberErasure['source'] = member.deletionRequest?.requestedAt
    ? 'data-request'
    : 'admin'

  // Every address they have used: the one on file, one waiting for its code, and earlier ones
  // the security log recorded against their IDs or application references
  const subjects = [
    member.artistId,
    member.partnerId,
    memberIdsOf(member),
    ...applications.map((a) => a.reference),
  ].filter((s): s is string => Boolean(s))
  const logged = subjects.length
    ? await execute<{ email: string }>(
        payload,
        sql`SELECT DISTINCT email FROM security_events
            WHERE email IS NOT NULL AND subject IN (${sql.join(
              subjects.map((s) => sql`${s}`),
              sql`, `,
            )})`,
      )
    : []
  const emailChange = (member as { emailChange?: { pendingEmail?: string | null } }).emailChange
  const addresses = unique([
    member.email,
    emailChange?.pendingEmail,
    ...logged.map((r) => r.email),
  ]).filter((a) => !a.endsWith(`@${ERASED_DOMAIN}`))

  // Identity and payout details first, with the existing purge (files, then rows), unless the
  // law makes us keep them: a legal hold in the future
  const record = (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  const holdUntil =
    record?.legalHoldUntil && new Date(record.legalHoldUntil) > new Date()
      ? record.legalHoldUntil
      : null
  let kyc: MemberErasure['kyc'] = 'none'
  let kept: string | null = null
  if (holdUntil) {
    kyc = 'kept'
    kept = `your identity and payout details, which we must hold until ${holdUntil.slice(0, 10)}.`
  } else {
    const { purgeKyc } = await import('@/kyc/service')
    if (await purgeKyc(payload, { memberId: member.id, reason: `Account deleted (${source})` }))
      kyc = 'purged'
  }

  // Works: those staff approved stay, archived, as the record of what was shown; the rest go
  const works = (
    await payload.find({
      collection: 'artworks',
      where: { owner: { equals: member.id } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as Artwork[]
  const wasApproved = (w: Artwork) => Boolean(w.published) || w.review?.state === 'approved'
  const keptWorks = works.filter(wasApproved)
  const goneWorks = works.filter((w) => !wasApproved(w))
  const keptPictures = new Set<number>()
  for (const w of keptWorks) {
    for (const id of (w.images ?? []).map(idOf)) if (id) keptPictures.add(id)
    for (const id of (w.published as PublishedArtwork | null)?.images ?? []) keptPictures.add(id)
  }
  const pictures = (
    await payload.find({
      collection: 'portfolio-images',
      where: { owner: { equals: member.id } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
  ).docs.filter((p) => !keptPictures.has(p.id))

  const membersConfig = payload.collections.members.config
  const applicationsConfig = payload.collections.applications.config
  const now = new Date().toISOString()

  const logEntries = await withTransaction(payload, async (req) => {
    const common = {
      overrideAccess: true,
      req,
      context: { disableRevalidate: true, erasing: true },
    }
    for (const w of keptWorks) {
      await payload.update({
        collection: 'artworks',
        id: w.id,
        data: { archived: true },
        ...common,
      })
    }
    for (const w of goneWorks) {
      await payload.delete({ collection: 'artworks', id: w.id, ...common })
    }
    // Each picture's file goes with its row (src/storage/memberMediaAdapter.ts)
    for (const p of pictures) {
      await payload.delete({ collection: 'portfolio-images', id: p.id, ...common })
    }
    for (const application of applications) {
      await payload.update({
        collection: 'applications',
        id: application.id,
        data: {
          ...blankOf(applicationsConfig.fields, APPLICATION_KEEP),
          rounds: (application.rounds ?? []).map((round) => ({ ...round, note: null })),
        } as never,
        ...common,
      })
    }
    await executeIn(payload, req, sql`DELETE FROM member_sessions WHERE member_id = ${member.id}`)
    if (addresses.length) {
      const list = sql.join(
        addresses.map((a) => sql`${a}`),
        sql`, `,
      )
      await executeIn(
        payload,
        req,
        sql`DELETE FROM login_challenges WHERE lower(email) IN (${list})`,
      )
      // Messages they sent through the site's forms
      await executeIn(
        payload,
        req,
        sql`DELETE FROM form_submissions WHERE id IN (
              SELECT _parent_id FROM form_submissions_submission_data WHERE lower(value) IN (${list}))`,
      )
    }
    await payload.update({
      collection: 'members',
      id: member.id,
      data: {
        ...blankOf(membersConfig.fields, MEMBER_KEEP),
        email: `erased-${member.id}@${ERASED_DOMAIN}`,
        displayName: placeholder,
        standing: 'erased',
        erasure: { at: now, by: actor.id, source, reason: why, kept: kept ?? null },
      } as never,
      ...common,
    })
    const changed = await eraseFromLog(payload, req, addresses, placeholder)
    await logSecurityEvent(payload, {
      event: 'member-erased',
      subject: subjects[0] ?? placeholder,
      actor: actor.id,
      detail: [
        source === 'data-request' ? 'At their request' : 'By staff',
        `by ${actor.email}: ${why}`,
        `KYC ${kyc}`,
        `${keptWorks.length} work(s) archived, ${goneWorks.length} removed`,
        `${pictures.length} picture(s) deleted`,
      ].join('; '),
      req,
    })
    return changed
  })

  // Only once it is done: told at the address they had
  let emailed = false
  const to = normaliseEmail(member.email)
  if (to && !to.endsWith(`@${ERASED_DOMAIN}`)) {
    const { sendAccountErased } = await import('@/members/emails')
    emailed = await sendAccountErased(payload, { to, kept })
  }

  return {
    placeholder,
    source,
    kept,
    kyc,
    worksArchived: keptWorks.length,
    worksRemoved: goneWorks.length,
    picturesDeleted: pictures.length,
    applications: applications.length,
    logEntries,
    emailed,
  }
}

/** What "Delete this person" will do, for the admin to show before anyone confirms */
export const memberErasurePreview = async (payload: Payload, memberId: number) => {
  const member = (await payload
    .findByID({ collection: 'members', id: memberId, depth: 0, overrideAccess: true })
    .catch(() => null)) as Member | null
  if (!member) return null
  const latest = (
    await payload.find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  const record = (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  const works = (
    await payload.find({
      collection: 'artworks',
      where: { owner: { equals: member.id } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
  ).docs as Artwork[]
  const approved = works.filter((w) => Boolean(w.published) || w.review?.state === 'approved')
  const holdUntil =
    record?.legalHoldUntil && new Date(record.legalHoldUntil) > new Date()
      ? record.legalHoldUntil
      : null
  return {
    erased: Boolean(member.erasure?.at || member.standing === 'erased'),
    confirm: memberConfirmation(member, latest?.reference),
    placeholder: memberPlaceholder(member, latest?.reference),
    requestedAt: member.deletionRequest?.requestedAt ?? null,
    kyc: record ? (holdUntil ? 'kept' : 'purged') : 'none',
    holdUntil,
    worksArchived: approved.length,
    worksRemoved: works.length - approved.length,
  }
}

/**
 * A member's own request to be deleted, from their account: recorded on their record for staff,
 * who carry it out with the same "Delete this person" (and so the same erasure) as any other
 */
export const recordDeletionRequest = async (payload: Payload, member: Member) => {
  if (member.deletionRequest?.requestedAt) return false
  await payload.update({
    collection: 'members',
    id: member.id,
    data: { deletionRequest: { requestedAt: new Date().toISOString() } } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  return true
}

/* ─── Staff ─────────────────────────────────────────────────────────────── */

export type StaffErasure = { placeholder: string; logEntries: number }

export const eraseStaff = async (
  payload: Payload,
  {
    userId,
    actor,
    reason,
    confirm,
  }: { userId: number; actor: User | null | undefined; reason: unknown; confirm: unknown },
): Promise<StaffErasure> => {
  if (!actor || !isSuperAdmin(actor)) {
    throw new ErasureError('Only a super admin can delete someone.', 403)
  }
  const why = reasonOf(reason)
  if (actor.id === userId) throw new ErasureError('You cannot delete your own account.', 409)
  const user = (await payload
    .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
    .catch(() => null)) as User | null
  if (!user) throw new ErasureError('There is no such account.', 404)
  if (user.status === 'erased')
    throw new ErasureError('This account has already been deleted.', 409)
  if (!user.staffRef) throw new ErasureError('This account has no staff reference yet.', 409)
  if (
    String(confirm ?? '')
      .trim()
      .toUpperCase() !== user.staffRef.toUpperCase()
  ) {
    throw new ErasureError(`To confirm, type ${user.staffRef} exactly.`)
  }
  if ((user.roles ?? []).includes('super-admin')) {
    const others = await payload.count({
      collection: 'users',
      where: {
        and: [
          { roles: { contains: 'super-admin' } },
          { status: { equals: 'active' } },
          { id: { not_equals: user.id } },
        ],
      },
      overrideAccess: true,
    })
    if (others.totalDocs === 0) {
      throw new ErasureError('This is the last super admin. Make someone else one first.', 409)
    }
  }
  const staffRef = user.staffRef
  const placeholder = staffPlaceholder(staffRef)
  const address = normaliseEmail(user.email)
  const erasedAddress = `erased-${staffRef.toLowerCase()}@${ERASED_DOMAIN}`

  const logEntries = await withTransaction(payload, async (req) => {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        name: placeholder,
        email: erasedAddress,
        roles: ['editor'],
        tenants: [],
        status: 'erased',
        // Nobody knows it, and nothing can set it again: the account cannot sign in
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        sessions: [],
        erasure: { at: new Date().toISOString(), by: actor.id, reason: why },
      } as never,
      overrideAccess: true,
      req,
      context: { disableRevalidate: true, erasing: true },
    })
    await executeIn(
      payload,
      req,
      sql`UPDATE users SET reset_password_token = NULL, reset_password_expiration = NULL,
            login_attempts = 0, lock_until = NULL WHERE id = ${user.id}`,
    )
    // Their request for admin access stays, as the record of who approved it, without them in it
    await executeIn(
      payload,
      req,
      sql`UPDATE access_requests SET email = ${erasedAddress},
            name = ${placeholder}, message = NULL, ip = NULL WHERE lower(email) = ${address}`,
    )
    const changed = await eraseFromLog(payload, req, [address], placeholder)
    await logSecurityEvent(payload, {
      event: 'staff-erased',
      subject: staffRef,
      actor: actor.id,
      detail: `By ${actor.email}: ${why}`,
      req,
    })
    return changed
  })
  return { placeholder, logEntries }
}
