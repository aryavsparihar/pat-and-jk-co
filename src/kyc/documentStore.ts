import 'server-only'

import { del, get, put } from '@vercel/blob'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Where encrypted KYC documents are kept. Everything stored here is already ciphertext
 * (src/kyc/crypto.ts), so even a leaked file is unreadable without the master key.
 *
 *   production / preview   a *private* Vercel Blob store of its own, separate from site media,
 *                          read and written only with KYC_BLOB_READ_WRITE_TOKEN; nothing in it has
 *                          a public URL
 *   local development      .uploads/kyc on disk, outside public/, git-ignored
 *
 * Preview deployments write under preview/, as member uploads do.
 */

const LOCAL_ROOT = path.resolve(process.cwd(), '.uploads/kyc')

const token = () => process.env.KYC_BLOB_READ_WRITE_TOKEN

const inBlobStore = () => Boolean(token())

const prefix = () => {
  const env = process.env.VERCEL_ENV
  return !env || env === 'production' ? 'kyc/' : `${env}/kyc/`
}

/** Stores ciphertext under a random name; returns the key to find it again */
export const storeEncrypted = async (name: string, bytes: Buffer): Promise<string> => {
  const key = `${prefix()}${name}`
  if (inBlobStore()) {
    await put(key, bytes, {
      access: 'private',
      token: token(),
      contentType: 'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
    })
    return key
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('KYC_BLOB_READ_WRITE_TOKEN is not set; KYC documents cannot be stored')
  }
  const file = path.join(LOCAL_ROOT, key)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes, { mode: 0o600 })
  return key
}

export const readEncrypted = async (key: string): Promise<Buffer> => {
  if (inBlobStore()) {
    const result = await get(key, { access: 'private', token: token(), useCache: false })
    if (!result || result.statusCode !== 200 || !result.stream)
      throw new Error('KYC document not found')
    return Buffer.from(await new Response(result.stream).arrayBuffer())
  }
  const file = path.join(LOCAL_ROOT, key)
  if (!file.startsWith(LOCAL_ROOT)) throw new Error('Bad document key')
  return readFile(file)
}

export const deleteEncrypted = async (key: string): Promise<void> => {
  if (inBlobStore()) {
    await del(key, { token: token() })
    return
  }
  const file = path.join(LOCAL_ROOT, key)
  if (file.startsWith(LOCAL_ROOT)) await rm(file, { force: true })
}
