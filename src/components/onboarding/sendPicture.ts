'use client'

import { type ApiResult, uploadWithProgress } from './api'

/**
 * Where one picture has got to, honestly:
 *
 *   sending    on its way; `fraction` is how much has actually gone, or null while that cannot be
 *              measured (making it smaller first, or a browser that does not say)
 *   preparing  all of it has arrived, and the server is checking it and making a clean copy;
 *              there is no way to measure that, so no number is given
 */
export type PictureProgress = { phase: 'sending'; fraction: number | null } | { phase: 'preparing' }

/** The longest side a picture is kept at, here and on the server (src/members/portfolio.ts) */
const LONG_SIDE = 2400
/** Comfortably under the 4.5 MB Vercel accepts in one request */
const MAX_BYTES = 4 * 1024 * 1024

class PictureError extends Error {}

/**
 * Makes a picture no larger than it needs to be before it leaves the browser: at most 2400 px on
 * its longest side, as a JPEG, turned the right way up. Smaller files cost less to send and to
 * keep. An iPhone's HEIC photo arrives as JPEG already, as the file picker asks only for JPEG, PNG
 * or WebP. The server checks and re-encodes it again whatever happens here.
 */
const shrink = async (file: File): Promise<Blob> => {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PictureError(
      'This browser could not open that picture. Please send a JPEG, PNG or WebP.',
    )
  }
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new PictureError('That picture could not be prepared. Please try again.')
  // A transparent PNG becomes a picture on white, as the server would make it
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  for (const quality of [0.92, 0.85, 0.75]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new PictureError('That picture is too detailed to send. Please try a smaller one.')
}

/**
 * Sends one picture: made smaller here, then sent to the server, which checks what it really is,
 * re-encodes it without any location or camera details, and keeps it in private storage. Nothing
 * goes to public storage on the way.
 */
export const sendPicture = async <T>(
  file: File,
  onProgress: (progress: PictureProgress) => void,
): Promise<ApiResult<T>> => {
  onProgress({ phase: 'sending', fraction: null })
  let smaller: Blob
  try {
    smaller = await shrink(file)
  } catch (error) {
    const message =
      error instanceof PictureError ? error.message : 'That picture could not be prepared.'
    return { ok: false, status: 0, data: { message } as ApiResult<T>['data'] }
  }
  const form = new FormData()
  form.append('file', smaller, 'picture.jpg')
  return uploadWithProgress<T>(
    '/next/members/portfolio',
    form,
    (fraction) => onProgress({ phase: 'sending', fraction }),
    () => onProgress({ phase: 'preparing' }),
  )
}
