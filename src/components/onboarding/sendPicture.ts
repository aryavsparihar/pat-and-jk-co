'use client'

import { upload } from '@vercel/blob/client'

import { api, type ApiResult, uploadWithProgress } from './api'

/**
 * Where one picture has got to, honestly:
 *
 *   sending    on its way; `fraction` is how much has actually gone, or null while that cannot be
 *              measured (asking for permission to upload, or a browser that does not say)
 *   preparing  all of it has arrived, and the server is checking it and making a clean copy;
 *              there is no way to measure that, so no number is given
 */
export type PictureProgress = { phase: 'sending'; fraction: number | null } | { phase: 'preparing' }

/**
 * Sends one picture: straight to Blob storage in production (the transfer measured by
 * @vercel/blob, patched to use XHR in browsers), as a form upload locally. Either way the server
 * then checks and re-encodes it, and answers with the picture as stored.
 */
export const sendPicture = async <T>(
  file: File,
  { mode, prefix }: { mode: 'blob' | 'direct'; prefix: string },
  onProgress: (progress: PictureProgress) => void,
): Promise<ApiResult<T>> => {
  onProgress({ phase: 'sending', fraction: null })
  if (mode === 'blob') {
    const blob = await upload(`${prefix}${file.name.replace(/[^\w.-]/g, '_')}`, file, {
      access: 'public',
      handleUploadUrl: '/next/members/portfolio/upload-token',
      contentType: file.type,
      onUploadProgress: ({ loaded, total }) =>
        onProgress({ phase: 'sending', fraction: total > 0 ? loaded / total : null }),
    })
    onProgress({ phase: 'preparing' })
    return api<T>('/next/members/portfolio', { body: { blobUrl: blob.url } })
  }
  const form = new FormData()
  form.append('file', file)
  return uploadWithProgress<T>(
    '/next/members/portfolio',
    form,
    (fraction) => onProgress({ phase: 'sending', fraction }),
    () => onProgress({ phase: 'preparing' }),
  )
}
