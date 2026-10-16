import 'server-only'

import { del, get, head, put } from '@vercel/blob'
import { getVercelOidcToken } from '@vercel/oidc'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Where artists' pictures are kept while only they and staff may see them: their works, and their
 * portrait. Nothing stored here has a public URL. It is served only through the app, to the
 * artist and to staff (src/app/(frontend)/next/media, and Payload's file route for the admin),
 * never through a public link, the image optimiser or the CDN. Pictures for the public are copied
 * out to public storage when a work is published, and only then.
 *
 *   on Vercel            the private Blob store (KYC_STORE_ID), in its own media/ folder, reached
 *                        with the deployment's OIDC token, as KYC documents are (src/kyc)
 *   local development    .uploads/media on disk, outside public/, git-ignored
 *
 * As with KYC, the store is never chosen by fallback: @vercel/blob would otherwise reach for the
 * public media store's credentials. A read-write token is never used.
 *
 * Production and previews share the store, so each environment has its own folder, and a key
 * outside the current environment's folder can be neither read nor deleted.
 */

const LOCAL_ROOT = path.resolve(process.cwd(), '.uploads/media')

export class PrivateMediaError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message)
    this.name = 'PrivateMediaError'
  }
}

const normalise = (id: string | undefined) =>
  (id ?? '')
    .trim()
    .replace(/^store_/i, '')
    .toLowerCase()

const storeId = (): string | null => {
  const id = process.env.KYC_STORE_ID?.trim()
  if (!id) return null
  if (normalise(id) === normalise(process.env.BLOB_STORE_ID)) {
    throw new PrivateMediaError('KYC_STORE_ID is the public media store; refusing to use it')
  }
  return id
}

/** This environment's folder: media/ in production, preview/media/ on previews, and so on */
export const mediaFolder = (): string => {
  const env = process.env.VERCEL_ENV
  return env === 'production' ? 'media' : `${env || 'development'}/media`
}

/** A key this environment may use: in its own folder, and nothing that could climb out of it */
export const ownMediaKey = (key: string): string => {
  if (
    !key.startsWith(`${mediaFolder()}/`) ||
    key.includes('..') ||
    !/^[a-z0-9/._-]+$/i.test(key)
  ) {
    throw new PrivateMediaError('This file belongs elsewhere', 404)
  }
  return key
}

const credentials = async (id: string) => {
  let oidcToken = ''
  try {
    oidcToken = (await getVercelOidcToken()).trim()
  } catch {
    // Handled below
  }
  if (!oidcToken) throw new PrivateMediaError('The private store cannot be reached from here')
  return { oidcToken, storeId: id }
}

const refuseWithoutStore = () => {
  if (process.env.NODE_ENV === 'production') {
    throw new PrivateMediaError('KYC_STORE_ID is not set; private pictures cannot be stored')
  }
}

const localFile = (key: string) => {
  const file = path.join(LOCAL_ROOT, key)
  if (!file.startsWith(LOCAL_ROOT + path.sep)) throw new PrivateMediaError('Bad key', 404)
  return file
}

/** Stores a file privately under `key` (in this environment's folder) */
export const putPrivate = async (key: string, bytes: Buffer, contentType: string) => {
  ownMediaKey(key)
  const id = storeId()
  if (id) {
    const auth = await credentials(id)
    const result = await put(key, bytes, {
      ...auth,
      access: 'private',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    })
    // The file must have landed in a private store, and in this one
    const host = new URL(result.url).hostname
    if (
      !host.endsWith('.private.blob.vercel-storage.com') ||
      !host.startsWith(`${normalise(id)}.`)
    ) {
      await del(result.url, auth).catch(() => undefined)
      throw new PrivateMediaError('A picture went to the wrong store and was removed')
    }
    return
  }
  refuseWithoutStore()
  const file = localFile(key)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes, { mode: 0o600 })
}

/** The file's bytes, or null if there is none */
export const readPrivate = async (key: string): Promise<Buffer | null> => {
  ownMediaKey(key)
  const id = storeId()
  if (id) {
    const result = await get(key, { ...(await credentials(id)), access: 'private', useCache: false })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    return Buffer.from(await new Response(result.stream).arrayBuffer())
  }
  refuseWithoutStore()
  try {
    return await readFile(localFile(key))
  } catch {
    return null
  }
}

export const existsPrivate = async (key: string): Promise<boolean> => {
  ownMediaKey(key)
  const id = storeId()
  if (id) {
    try {
      await head(key, await credentials(id))
      return true
    } catch {
      return false
    }
  }
  refuseWithoutStore()
  try {
    await readFile(localFile(key))
    return true
  } catch {
    return false
  }
}

export const deletePrivate = async (key: string): Promise<void> => {
  ownMediaKey(key)
  const id = storeId()
  if (id) {
    await del(key, await credentials(id))
    return
  }
  refuseWithoutStore()
  await rm(localFile(key), { force: true })
}
