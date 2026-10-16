import type { Payload } from 'payload'

import type { Artwork, Member, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'

import { memberIdsOf } from '../collections/Members'
import { notifyStaffOfReview, sendReviewDecision } from './emails'
import type { ArtworkInput, ContactInput, ProfileInput } from './forms/portal'

/**
 * The approved artist's portal: their works and their public profile, and the staff review that
 * stands between those and the public (src/members/reviewFields.ts).
 *
 * Every function checks ownership itself and writes with the Local API; members never reach these
 * collections through Payload's API. What the public may see is decided in one place,
 * `syncPublicImages`, so a picture is readable by anyone only while an approved, unarchived work
 * or an approved portrait uses it.
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

const phulhaar = async (payload: Payload) =>
  (
    await payload.find({
      collection: 'ventures',
      where: { slug: { equals: 'phulhaar-gallery' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]?.id ?? null

/* ─── Works ─────────────────────────────────────────────────────────────── */

const ownArtwork = async (payload: Payload, member: Member, id: number): Promise<Artwork> => {
  const work = await payload
    .findByID({ collection: 'artworks', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!work || idOf(work.owner) !== member.id) {
    throw new PortalError('That work could not be found.', 404)
  }
  return work
}

/** What the member sees of one of their works: the working copy and where its review stands */
export const artworkView = (work: Artwork) => ({
  id: work.id,
  title: work.title,
  year: work.year ?? null,
  medium: work.medium ?? null,
  surface: work.surface ?? null,
  widthCm: work.widthCm ?? null,
  heightCm: work.heightCm ?? null,
  depthCm: work.depthCm ?? null,
  edition: work.edition ?? null,
  forSale: work.forSale !== false,
  priceInr: work.priceInr ?? null,
  availability: work.availability ?? 'available',
  description: work.description ?? null,
  images: (work.images ?? []).map(idOf).filter((v): v is number => v !== null),
  archived: Boolean(work.archived),
  review: {
    state: work.review?.state ?? 'none',
    note: work.review?.state === 'changes-requested' ? (work.review?.note ?? null) : null,
  },
  isPublic: Boolean(work.published) && !work.archived,
})

export const listOwnArtworks = async (payload: Payload, member: Member) => {
  requireArtist(member)
  const works = await payload.find({
    collection: 'artworks',
    where: { owner: { equals: member.id } },
    sort: 'sortOrder',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  return works.docs.map(artworkView)
}

const submitted = () => ({
  state: 'pending' as const,
  note: null,
  submittedAt: new Date().toISOString(),
  reviewedAt: null,
  reviewedBy: null,
})

/**
 * The artist describes a work; its pictures and any video are in their Google Drive folder, in a
 * folder named after it. Staff add the pictures here when they approve it.
 */
export const createArtwork = async (payload: Payload, member: Member, input: ArtworkInput) => {
  requireArtist(member)
  const last = await payload.find({
    collection: 'artworks',
    where: { owner: { equals: member.id } },
    sort: '-sortOrder',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const work = await payload.create({
    collection: 'artworks',
    data: {
      ...input,
      owner: member.id,
      venture: await phulhaar(payload),
      sortOrder: (last.docs[0]?.sortOrder ?? 0) + 1,
      review: submitted(),
    } as never,
    overrideAccess: true,
    context: ctx,
  })
  await notifyStaffOfReview(payload, {
    what: `A new work, “${work.title}”`,
    memberId: memberIdsOf(member) ?? `Member ${member.id}`,
    adminPath: `/admin/collections/artworks/${work.id}`,
  })
  return artworkView(work)
}

/** Edits go to review again; the published version stays up until the new one is approved */
export const updateArtwork = async (
  payload: Payload,
  member: Member,
  id: number,
  input: ArtworkInput,
) => {
  requireArtist(member)
  await ownArtwork(payload, member, id)
  // The pictures are staff's to add and order: an edit by the artist leaves them as they are
  const work = await payload.update({
    collection: 'artworks',
    id,
    data: { ...input, review: submitted() } as never,
    overrideAccess: true,
    context: ctx,
  })
  await notifyStaffOfReview(payload, {
    what: `Changes to “${work.title}”`,
    memberId: memberIdsOf(member) ?? `Member ${member.id}`,
    adminPath: `/admin/collections/artworks/${work.id}`,
  })
  return artworkView(work)
}

/** Archiving hides a work at once, with no review; unarchiving shows the approved version again */
export const archiveArtwork = async (
  payload: Payload,
  member: Member,
  id: number,
  archived: boolean,
) => {
  requireArtist(member)
  await ownArtwork(payload, member, id)
  const work = await payload.update({
    collection: 'artworks',
    id,
    data: { archived },
    overrideAccess: true,
    context: ctx,
  })
  await syncPublicImages(payload, member.id)
  return artworkView(work)
}

/** The member's order for their works, given as the full list of their ids */
export const reorderArtworks = async (payload: Payload, member: Member, ids: number[]) => {
  requireArtist(member)
  const own = await payload.find({
    collection: 'artworks',
    where: { owner: { equals: member.id } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const mine = new Set(own.docs.map((w) => w.id))
  if (ids.length !== mine.size || !ids.every((id) => mine.has(id))) {
    throw new PortalError('The list of works has changed. Please reload the page.', 409)
  }
  for (const [index, id] of ids.entries()) {
    await payload.update({
      collection: 'artworks',
      id,
      data: { sortOrder: index + 1 },
      overrideAccess: true,
      context: ctx,
    })
  }
  return listOwnArtworks(payload, member)
}

/** The public fields of a work, as staff approved them */
const snapshotOf = (work: Artwork) => ({
  title: work.title,
  year: work.year ?? null,
  medium: work.medium ?? null,
  surface: work.surface ?? null,
  widthCm: work.widthCm ?? null,
  heightCm: work.heightCm ?? null,
  depthCm: work.depthCm ?? null,
  edition: work.edition ?? null,
  forSale: work.forSale !== false,
  priceInr: work.forSale !== false ? (work.priceInr ?? null) : null,
  availability: work.availability ?? 'available',
  description: work.description ?? null,
  images: (work.images ?? []).map(idOf).filter((v): v is number => v !== null),
})

export type PublishedArtwork = ReturnType<typeof snapshotOf>

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
    context: ctx,
  })
  await notifyStaffOfReview(payload, {
    what: 'A profile',
    memberId: memberIdsOf(member) ?? `Member ${member.id}`,
    adminPath: `/admin/collections/members/${member.id}`,
  })
  return profileView(updated)
}

/**
 * The artist's Google Drive folder, which holds a folder per work (docs/ADMIN_GUIDE.md, "Artists'
 * works"). It changes at once, as it is never shown to the public; staff are told when it is first
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
    context: ctx,
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
    context: ctx,
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

export const decideArtwork = async (
  payload: Payload,
  {
    id,
    decision,
    note,
    actor,
  }: { id: number; decision: ReviewDecision; note?: string; actor: User },
) => {
  if (decision === 'request-changes' && !note?.trim()) {
    throw new PortalError('Write a note to the artist saying what to change.')
  }
  const work = await payload.findByID({
    collection: 'artworks',
    id,
    depth: 0,
    overrideAccess: true,
  })
  const review = { ...work.review, ...decided(decision, actor, note) }
  const data =
    decision === 'approve'
      ? { review, published: snapshotOf(work), publishedAt: new Date().toISOString() }
      : { review }
  await payload.update({
    collection: 'artworks',
    id,
    data: data as never,
    overrideAccess: true,
    context: ctx,
  })
  const owner = await ownerOf(payload, idOf(work.owner)!)
  if (decision === 'approve') await syncPublicImages(payload, owner.id)
  await logSecurityEvent(payload, {
    event: decision === 'approve' ? 'portal-approved' : 'portal-changes-requested',
    actor: actor.id,
    subject: memberIdsOf(owner) ?? `member ${owner.id}`,
    detail: `work ${id}`,
  })
  await sendReviewDecision(payload, {
    to: owner.email,
    what: `Your work “${work.title}”`,
    approved: decision === 'approve',
    note,
  })
}

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
    context: ctx,
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
 * Makes exactly the right pictures public for one member: those in the approved snapshot of an
 * unarchived work, and the approved portrait. Everything else of theirs is private again.
 */
export const syncPublicImages = async (payload: Payload, memberId: number) => {
  const works = await payload.find({
    collection: 'artworks',
    where: { and: [{ owner: { equals: memberId } }, { archived: { not_equals: true } }] },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  const member = await ownerOf(payload, memberId)
  const wanted = new Set<number>()
  for (const work of works.docs) {
    for (const id of (work.published as PublishedArtwork | null)?.images ?? []) wanted.add(id)
  }
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

/** An artist's works as the public may see them: approved, unarchived, in their order */
export const publicArtworksOf = async (payload: Payload, memberId: number) => {
  const member = await ownerOf(payload, memberId)
  if (!member.artistId || member.standing !== 'active') return []
  const works = await payload.find({
    collection: 'artworks',
    where: {
      and: [
        { owner: { equals: memberId } },
        { archived: { not_equals: true } },
        { publishedAt: { exists: true } },
      ],
    },
    sort: 'sortOrder',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  return works.docs.map((w) => ({ id: w.id, ...(w.published as PublishedArtwork) }))
}

/** Whether a picture is used by any of the member's works (working or published) or profile */
export const imageInUseByPortal = async (payload: Payload, memberId: number, imageId: number) => {
  const works = await payload.find({
    collection: 'artworks',
    where: { owner: { equals: memberId } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  for (const work of works.docs) {
    const used = [
      ...(work.images ?? []).map(idOf),
      ...((work.published as PublishedArtwork | null)?.images ?? []),
    ]
    if (used.includes(imageId)) return true
  }
  const member = await ownerOf(payload, memberId)
  return (
    idOf(member.profile?.portrait as never) === imageId ||
    (member.publicProfile as PublishedProfile | null)?.portrait === imageId
  )
}
