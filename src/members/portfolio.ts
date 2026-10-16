import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import sharp, { type Metadata } from 'sharp'

import type { Member, PortfolioImage } from '@/payload-types'


/**
 * Every picture an artist sends passes through here before it is kept:
 *
 *   1. what it is, from its bytes: JPEG, PNG or WebP only, whatever the name or the browser says
 *   2. big enough to judge the work from, and not a decompression bomb
 *   3. re-encoded as a JPEG, upright, at most 4000 px on its longest side, converted to sRGB with
 *      the sRGB profile attached so colours do not shift. Re-encoding drops every other piece of
 *      metadata, EXIF and the GPS position a phone writes into a photo included
 *   4. stored as this artist's own; Payload makes the web-sized copies
 */

/** What one request may carry: the browser sends at most 4 MB (src/components/onboarding/sendPicture.ts) */
export const PORTFOLIO_MAX_BYTES = 5 * 1024 * 1024
const MAX_PIXELS = 50_000_000
/**
 * The smallest picture accepted, in pixels on its longest side, for application pictures and the
 * portfolio alike. Null: no minimum for now. Set a number here to bring one back; the check and
 * its message are already in place.
 */
export const PORTFOLIO_MIN_LONG_SIDE: number | null = null
/** Larger pictures are shrunk to this; smaller ones are never enlarged */
const MAX_LONG_SIDE = 2400
/** Ten works, with room to replace a few pictures along the way */
export const MAX_IMAGES_PER_MEMBER = 16
/** An approved artist keeps pictures for every work in their portfolio, up to eight each */
export const MAX_IMAGES_PER_ARTIST = 400

/** How many pictures this member may keep */
export const imageLimitFor = (member: Pick<Member, 'artistId'>) =>
  member.artistId ? MAX_IMAGES_PER_ARTIST : MAX_IMAGES_PER_MEMBER

/**
 * Pictures can be added while an artist application is open, and at any time once the artist is
 * approved (for their portfolio).
 */
export const canAddPictures = (
  member: Pick<Member, 'artistId'>,
  application: { stage: string } | null,
) =>
  Boolean(member.artistId) ||
  Boolean(application && ['draft', 'changes-requested'].includes(application.stage))

const ACCEPTED = new Set(['jpeg', 'png', 'webp'])

export class PortfolioError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}

/** Checks and cleans an image. Returns a fresh JPEG with no metadata. */
export const cleanImage = async (
  input: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> => {
  if (input.length > PORTFOLIO_MAX_BYTES) {
    throw new PortfolioError('That picture is larger than 5 MB. Please send a smaller version.')
  }
  let meta: Metadata
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata()
  } catch {
    throw new PortfolioError(
      'That file is not a picture we can open. Please send a JPEG, PNG or WebP.',
    )
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) {
    throw new PortfolioError('Please send a JPEG, PNG or WebP picture.')
  }
  const longSide = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (PORTFOLIO_MIN_LONG_SIDE !== null && longSide < PORTFOLIO_MIN_LONG_SIDE) {
    throw new PortfolioError(
      `That picture is small. Please send one at least ${PORTFOLIO_MIN_LONG_SIDE} pixels on its longest side.`,
    )
  }

  const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate() // apply the camera's orientation before the metadata that records it is dropped
    .resize({
      width: MAX_LONG_SIDE,
      height: MAX_LONG_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' }) // a transparent PNG becomes a picture on white
    // Colour: convert from whatever profile the photograph carries (Display P3 from most phones,
    // Adobe RGB from many cameras) into sRGB, and attach the sRGB profile, so the work looks the
    // same in every browser. This is the only metadata written: EXIF and GPS are not.
    .withIccProfile('srgb')
    // High quality, and full-resolution colour (no chroma subsampling), so fine colour detail in
    // a painting is not averaged away
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** Keeps a cleaned picture as one of the artist's portfolio images. */
export const ingestPortfolioImage = async (
  payload: Payload,
  member: Member,
  input: Buffer,
): Promise<PortfolioImage> => {
  const existing = await payload.count({
    collection: 'portfolio-images',
    where: { owner: { equals: member.id } },
    overrideAccess: true,
  })
  if (existing.totalDocs >= imageLimitFor(member)) {
    throw new PortfolioError(
      'You have uploaded a lot of pictures. Please remove some you are not using first.',
      409,
    )
  }

  const { data } = await cleanImage(input)
  return payload.create({
    collection: 'portfolio-images',
    data: { owner: member.id },
    file: {
      data,
      mimetype: 'image/jpeg',
      // A name that says nothing about the artist or the original file
      name: `work-${randomBytes(8).toString('hex')}.jpg`,
      size: data.length,
    },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
}
