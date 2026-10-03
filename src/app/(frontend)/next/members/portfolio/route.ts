import { del } from '@vercel/blob'

import { EDITABLE, findOwnApplication } from '@/members/application'
import { fromOurOrigin, refuseCrossSite, reply, requireMember, withRefresh } from '@/members/http'
import {
  blobUploadsAvailable,
  fetchCapped,
  incomingPrefix,
  ingestPortfolioImage,
  isOwnIncomingBlob,
  PortfolioError,
  PORTFOLIO_MAX_BYTES,
} from '@/members/portfolio'
import { hitLimit } from '@/security/rateLimit'

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
  return withRefresh(
    reply({
      mode: blobUploadsAvailable() ? 'blob' : 'direct',
      // Where this member's browser may put files in the Blob store (checked again on import)
      uploadPrefix: incomingPrefix(member),
      images: images.docs.map(imageView),
    }),
    auth.refresh,
  )
}

/**
 * Takes one picture: either the file itself (local development, small files), or the address of
 * one the browser has just put in our Blob store (production, any size up to 25 MB).
 */
export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const application = await findOwnApplication(payload, member, 'artist', 0)
  if (!application || !EDITABLE.includes(application.stage)) {
    return reply(
      { message: 'Pictures can only be added while your application is open.' },
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
    return reply({ message: 'That is a lot of uploads. Please wait a while.' }, { status: 429 })

  let incoming: string | null = null
  try {
    let bytes: Buffer
    const type = request.headers.get('content-type') ?? ''
    if (type.startsWith('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File))
        return reply({ message: 'Please choose a picture.' }, { status: 400 })
      if (file.size > PORTFOLIO_MAX_BYTES)
        throw new PortfolioError('That picture is larger than 25 MB.')
      bytes = Buffer.from(await file.arrayBuffer())
    } else {
      const body = (await request.json().catch(() => null)) as { blobUrl?: string } | null
      if (!body?.blobUrl || !isOwnIncomingBlob(body.blobUrl, member)) {
        return reply({ message: 'That upload could not be found.' }, { status: 400 })
      }
      incoming = body.blobUrl
      bytes = await fetchCapped(incoming)
    }

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
        via: incoming ? 'blob' : 'direct',
      })
      return reply({ message: error.message }, { status: error.status })
    }
    payload.logger.error({
      err: error,
      msg: 'Portfolio upload failed',
      member: member.id,
      via: incoming ? 'blob' : 'direct',
    })
    return reply({ message: 'That picture could not be saved. Please try again.' }, { status: 500 })
  } finally {
    // The raw upload is never kept: only the cleaned copy is
    // The incoming folder is in the public media store: its token, never a fallback credential
    if (incoming)
      await del(incoming, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined)
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
  if (!application || !EDITABLE.includes(application.stage)) {
    return reply(
      { message: 'Pictures can only be changed while your application is open.' },
      { status: 409 },
    )
  }
  const inUse = (application.portfolio ?? []).some(
    (w) => (typeof w.image === 'object' ? w.image?.id : w.image) === id,
  )
  if (inUse)
    return reply({ message: 'Remove that work from your portfolio first.' }, { status: 409 })

  const result = await payload.delete({
    collection: 'portfolio-images',
    where: { and: [{ id: { equals: id } }, { owner: { equals: member.id } }] },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  if (result.docs.length === 0)
    return reply({ message: 'That picture was not found.' }, { status: 404 })
  return withRefresh(reply({ ok: true }), auth.refresh)
}
