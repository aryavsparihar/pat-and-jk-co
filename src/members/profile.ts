import type { Payload } from 'payload'

import type { Member, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'

import { memberIdsOf } from '../collections/Members'
import { notifyStaffOfReview, sendReviewDecision } from './emails'
import type { ContactInput, ProfileInput } from './forms/portal'
import { actingFor } from '@/security/audit'

/**
 * The approved artist's portal: their public profile and the staff review that stands between it
 * and the public (src/members/reviewFields.ts), their contact details, and the Google Drive folder
 * their works are in. The works themselves (pictures, videos and each one's description) live in
 * that folder only (docs/ADMIN_GUIDE.md, "Artists' works").
 *
 * Every function checks ownership itself and writes with the Local API; members never reach these
 * collections through Payload's API. What the public may see is decided in one place,
 * `syncPublicImages`, so a picture is readable by anyone only while it is an approved portrait.
 */

export class PortalError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}

const ctx = { disableRevalidate: true }

/** Only an approved artist has a portfolio */
export const requireArtist = (member: Member) => {
  if (!member.artistId) {
    throw new PortalError('Your portfolio opens once your artist application is approved.', 403)
  }
}

const idOf = (v: number | { id: number } | null | undefined) =>
  v == null ? null : typeof v === 'object' ? v.id : v

/** The pictures must be this member's own */
const ownImages = async (payload: Payload, memberId: number, ids: number[]) => {
  if (ids.length === 0) return
  const found = await payload.find({
    collection: 'portfolio-images',
    where: { and: [{ id: { in: ids } }, { owner: { equals: memberId } }] },
    limit: ids.length,
    depth: 0,
    overrideAccess: true,
  })
  if (found.docs.length !== new Set(ids).size) {
    throw new PortalError('One of the pictures could not be found. Please upload it again.')
  }
}

const submitted = () => ({
  state: 'pending' as const,
  note: null,
  submittedAt: new Date().toISOString(),
  reviewedAt: null,
  reviewedBy: null,
})

/* ─── Profile ───────────────────────────────────────────────────────────── */

export const profileView = (member: Member) => ({
  displayName: member.profile?.displayName ?? member.displayName ?? '',
  bio: member.profile?.bio ?? '',
  statement: member.profile?.statement ?? '',
  links: (member.profile?.links ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
  portrait: idOf(member.profile?.portrait as never),
  mediums: member.profile?.mediums ?? [],
  exhibitions: (member.profile?.exhibitions ?? []).map((e) => ({
    title: e.title ?? '',
    venue: e.venue ?? '',
    year: e.year ?? null,
  })),
  review: {
    state: member.profileReview?.state ?? 'none',
    note:
      member.profileReview?.state === 'changes-requested'
        ? (member.profileReview?.note ?? null)
        : null,
  },
  isPublic: Boolean(member.publicProfile),
  contact: {
    phone: member.phone ?? '',
    contactAddress: member.contactAddress ?? {},
  },
})

/** The member's profile goes to review; the approved one stays public until the new one is */
export const saveProfile = async (payload: Payload, member: Member, input: ProfileInput) => {
  requireArtist(member)
  if (input.portrait) await ownImages(payload, member.id, [input.portrait])
  const updated = await payload.update({
    collection: 'members',
    id: member.id,
    data: {
      profile: { ...input, portrait: input.portrait ?? null },
      profileReview: submitted(),
    } as never,
    overrideAccess: true,
    context: { ...ctx, ...actingFor(member, 'members') },
  })
  await notifyStaffOfReview(payload, {
    what: 'A profile',
    memberId: memberIdsOf(member) ?? `Member ${member.id}`,
    adminPath: `/admin/collections/members/${member.id}`,
  })
  return profileView(updated)
}

/**
 * The artist's Google Drive folder, which holds a folder per work, each with its pictures, any
 * video and its description (docs/ADMIN_GUIDE.md, "Artists' works"). It changes at once, as it is never shown to the public; staff are told when it is first
 * given or changed, so they know where to look.
 */
export const saveWorksFolder = async (payload: Payload, member: Member, url: string | null) => {
  requireArtist(member)
  if ((member.worksFolder ?? null) === url) return { worksFolder: url }
  const updated = await payload.update({
    collection: 'members',
    id: member.id,
    data: { worksFolder: url, worksFolderUpdatedAt: new Date().toISOString() } as never,
    overrideAccess: true,
    context: { ...ctx, ...actingFor(member, 'members') },
  })
  if (url) {
    const { notifyStaffOfWorksFolder } = await import('./emails')
    await notifyStaffOfWorksFolder(payload, {
      memberId: memberIdsOf(member) ?? `Member ${member.id}`,
      adminPath: `/admin/collections/members/${member.id}`,
    })
  }
  return { worksFolder: updated.worksFolder ?? null }
}

/** Contact details change at once: they are never shown to the public */
export const saveContact = async (payload: Payload, member: Member, input: ContactInput) => {
  const updated = await payload.update({
    collection: 'members',
    id: member.id,
    data: {
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.contactAddress ? { contactAddress: input.contactAddress } : {}),
    } as never,
    overrideAccess: true,
    context: { ...ctx, ...actingFor(member, 'members') },
  })
  return profileView(updated).contact
}

const profileSnapshot = (member: Member) => {
  const view = profileView(member)
  return {
    displayName: view.displayName,
    bio: view.bio || null,
    statement: view.statement || null,
    links: view.links.filter((l) => l.url),
    portrait: view.portrait,
    mediums: view.mediums,
    exhibitions: view.exhibitions,
  }
}

export type PublishedProfile = ReturnType<typeof profileSnapshot>

/* ─── Staff review ──────────────────────────────────────────────────────── */

export type ReviewDecision = 'approve' | 'request-changes'

const decided = (decision: ReviewDecision, actor: User, note?: string | null) => ({
  state: decision === 'approve' ? ('approved' as const) : ('changes-requested' as const),
  note: note?.trim() || null,
  reviewedAt: new Date().toISOString(),
  reviewedBy: actor.id,
})

const ownerOf = async (payload: Payload, id: number) =>
  payload.findByID({ collection: 'members', id, depth: 0, overrideAccess: true })

export const decideProfile = async (
  payload: Payload,
  {
    memberId,
    decision,
    note,
    actor,
  }: { memberId: number; decision: ReviewDecision; note?: string; actor: User },
) => {
  if (decision === 'request-changes' && !note?.trim()) {
    throw new PortalError('Write a note to the artist saying what to change.')
  }
  const member = await ownerOf(payload, memberId)
  const review = { ...member.profileReview, ...decided(decision, actor, note) }
  const data =
    decision === 'approve'
      ? {
          profileReview: review,
          publicProfile: profileSnapshot(member),
          publicProfileAt: new Date().toISOString(),
        }
      : { profileReview: review }
  await payload.update({
    collection: 'members',
    id: memberId,
    data: data as never,
    overrideAccess: true,
    context: { ...ctx, ...actingFor(actor, 'users') },
  })
  if (decision === 'approve') await syncPublicImages(payload, memberId)
  await logSecurityEvent(payload, {
    event: decision === 'approve' ? 'portal-approved' : 'portal-changes-requested',
    actor: actor.id,
    subject: memberIdsOf(member) ?? `member ${memberId}`,
    detail: 'profile',
  })
  await sendReviewDecision(payload, {
    to: member.email,
    what: 'Your profile',
    approved: decision === 'approve',
    note,
  })
}

/* ─── What the public may see ───────────────────────────────────────────── */

/**
 * Makes exactly the right pictures public for one member: the approved portrait. Everything else
 * of theirs is private again.
 */
export const syncPublicImages = async (payload: Payload, memberId: number) => {
  const member = await ownerOf(payload, memberId)
  const wanted = new Set<number>()
  const portrait = (member.publicProfile as PublishedProfile | null)?.portrait
  if (portrait) wanted.add(portrait)

  const images = await payload.find({
    collection: 'portfolio-images',
    where: { owner: { equals: memberId } },
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })
  for (const image of images.docs) {
    const shouldBe = wanted.has(image.id)
    if (Boolean(image.public) !== shouldBe) {
      await payload.update({
        collection: 'portfolio-images',
        id: image.id,
        data: { public: shouldBe } as never,
        overrideAccess: true,
        context: ctx,
      })
    }
  }
}

/** Whether a picture is the member's portrait, in their working or published profile */
export const imageInUseByPortal = async (payload: Payload, memberId: number, imageId: number) => {
  const member = await ownerOf(payload, memberId)
  return (
    idOf(member.profile?.portrait as never) === imageId ||
    (member.publicProfile as PublishedProfile | null)?.portrait === imageId
  )
}
