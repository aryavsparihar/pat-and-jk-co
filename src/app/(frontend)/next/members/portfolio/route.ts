import { findOwnApplication } from '@/members/application'
import { imageInUseByPortal } from '@/members/profile'
import { fromOurOrigin, refuseCrossSite, reply, requireMember, withRefresh } from '@/members/http'
import {
  canAddPictures,
  ingestPortfolioImage,
  PortfolioError,
  PORTFOLIO_MAX_BYTES,
} from '@/members/portfolio'
import { hitLimit } from '@/security/rateLimit'
import { actingFor } from '@/security/audit'

export const dynamic = 'force-dynamic'

const imageView = (image: {
  id: number
  sizes?: { thumbnail?: { url?: string | null } | null } | null
  url?: string | null
}) => ({
  id: image.id,
  thumbnail: image.sizes?.thumbnail?.url ?? image.url ?? null,
})

/** The artist's own pictures, and how new ones should be sent */
export async function GET(request: Request) {
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  const images = await payload.find({
    collection: 'portfolio-images',
    where: { owner: { equals: member.id } },
    sort: 'createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  return withRefresh(reply({ images: images.docs.map(imageView) }), auth.refresh)
}

/**
 * Takes one picture, already made smaller by the browser (src/components/onboarding/sendPicture.ts),
 * checks what it really is, re-encodes it and keeps it in private storage. Nothing passes through
 * public storage on the way.
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!canAddPictures(member, application)) {
    return reply(
      { message: 'Your application has been sent, so pictures can no longer be added to it.' },
      { status: 409 },
    )
  }

  const limit = await hitLimit(payload, {
    scope: 'portfolio-upload',
    subject: String(member.id),
    max: 40,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply(
      {
        message:
          'You have uploaded a lot in a short time. Please wait a few minutes and try again.',
      },
      { status: 429 },
    )

  try {
    const type = request.headers.get('content-type') ?? ''
    if (!type.startsWith('multipart/form-data'))
      return reply({ message: 'Please choose a picture.' }, { status: 400 })
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File))
      return reply({ message: 'Please choose a picture.' }, { status: 400 })
    if (file.size > PORTFOLIO_MAX_BYTES)
      throw new PortfolioError('That picture is larger than 5 MB. Please send a smaller version.')
    const bytes = Buffer.from(await file.arrayBuffer())

    const image = await ingestPortfolioImage(payload, member, bytes)
    return withRefresh(reply({ image: imageView(image) }, { status: 201 }), auth.refresh)
  } catch (error) {
    // The applicant sees a refusal's own words, or a generic message; staff see why in the logs.
    // The member's number only, never their email or the file's name.
    if (error instanceof PortfolioError) {
      payload.logger.info({
        msg: 'Portfolio upload refused',
        member: member.id,
        status: error.status,
        reason: error.message,
      })
      return reply({ message: error.message }, { status: error.status })
    }
    payload.logger.error({
      err: error,
      msg: 'Portfolio upload failed',
      member: member.id,
    })
    return reply({ message: 'That picture could not be saved. Please try again.' }, { status: 500 })
  }
}

/** Removes one of the artist's own pictures while their application is open */
export async function DELETE(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isSafeInteger(id)) return reply({ message: 'Which picture?' }, { status: 400 })

  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!canAddPictures(member, application)) {
    return reply(
      { message: 'Your application has been sent, so its pictures can no longer be changed.' },
      { status: 409 },
    )
  }
  const inUse = (application?.portfolio ?? []).some(
    (w) => (typeof w.image === 'object' ? w.image?.id : w.image) === id,
  )
  if (inUse)
    return reply(
      {
        message: 'This picture belongs to a work in your portfolio. Please remove the work first.',
      },
      { status: 409 },
    )
  if (await imageInUseByPortal(payload, member.id, id)) {
    return reply(
      { message: 'This picture is used on your profile, so it cannot be removed here.' },
      { status: 409 },
    )
  }

  const result = await payload.delete({
    collection: 'portfolio-images',
    where: { and: [{ id: { equals: id } }, { owner: { equals: member.id } }] },
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(member, 'members') },
  })
  if (result.docs.length === 0)
    return reply(
      { message: 'We could not find that picture. It may already have been removed.' },
      { status: 404 },
    )
  return withRefresh(reply({ ok: true }), auth.refresh)
}
