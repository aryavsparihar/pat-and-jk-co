import 'server-only'

import { del, get, put } from '@vercel/blob'
import { getVercelOidcToken } from '@vercel/oidc'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Where encrypted KYC documents are kept. Everything stored here is already ciphertext
 * (src/kyc/crypto.ts), so even a leaked file is unreadable without the master key.
 *
 *   on Vercel            the private Blob store pjk-kyc (KYC_STORE_ID), reached with the
 *                        deployment's OIDC token; nothing in it has a public URL
 *   local development    .uploads/kyc on disk, outside public/, git-ignored
 *
 * The store is never chosen by fallback. @vercel/blob looks for credentials in a fixed order and
 * would fall back to BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN, both of which belong to the *public*
 * media store, so every call here passes the OIDC token and the KYC store ID explicitly, and
 * refuses to run without them. A read-write token is never used.
 *
 * Production and previews share the store, so each environment has its own folder (kyc/ for
 * production, preview/kyc/ for previews), and a document outside the current environment's folder
 * can be neither read nor deleted: a preview's purge, working on a database branched from
 * production, cannot touch production's files.
 */

const LOCAL_ROOT = path.resolve(process.cwd(), '.uploads/kyc')

export class KycStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KycStoreError'
  }
}

/** The store's ID without its "store_" prefix, lower-cased, as it appears in blob URLs */
const normalise = (id: string | undefined) =>
  (id ?? '')
    .trim()
    .replace(/^store_/i, '')
    .toLowerCase()

const kycStoreId = (): string | null => {
  const id = process.env.KYC_STORE_ID?.trim()
  if (!id) return null
  if (normalise(id) === normalise(process.env.BLOB_STORE_ID)) {
    throw new KycStoreError('KYC_STORE_ID is the public media store; refusing to use it')
  }
  return id
}

/** The folder for this environment: kyc/ in production, preview/kyc/ on previews */
export const kycPrefix = (): string => {
  const env = process.env.VERCEL_ENV
  return env === 'production' ? 'kyc/' : `${env || 'development'}/kyc/`
}

const ownKey = (key: string): string => {
  if (!key.startsWith(kycPrefix()) || key.includes('..') || !/^[a-z0-9/._-]+$/i.test(key)) {
    throw new KycStoreError('This document belongs to another environment')
  }
  return key
}

/** Credentials for the KYC store and nothing else, or a refusal */
const credentials = async (storeId: string) => {
  let oidcToken: string
  try {
    oidcToken = (await getVercelOidcToken()).trim()
  } catch {
    oidcToken = ''
  }
  if (!oidcToken) throw new KycStoreError('The KYC document store cannot be reached from here')
  return { oidcToken, storeId }
}

const refuseWithoutStore = () => {
  if (process.env.NODE_ENV === 'production') {
    throw new KycStoreError('KYC_STORE_ID is not set; KYC documents cannot be stored')
  }
}

/** Stores ciphertext under a random name; returns the key to find it again */
export const storeEncrypted = async (name: string, bytes: Buffer): Promise<string> => {
  const key = ownKey(`${kycPrefix()}${name}`)
  const storeId = kycStoreId()
  if (storeId) {
    const auth = await credentials(storeId)
    const result = await put(key, bytes, {
      ...auth,
      access: 'private',
      contentType: 'application/octet-stream',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
    })
    // Belt and braces: the file must have landed in a private store, and in this one
    const host = new URL(result.url).hostname
    if (
      !host.endsWith('.private.blob.vercel-storage.com') ||
      !host.startsWith(`${normalise(storeId)}.`)
    ) {
      await del(result.url, auth).catch(() => undefined)
      throw new KycStoreError('A KYC document went to the wrong store and was removed')
    }
    return key
  }
  refuseWithoutStore()
  const file = path.join(LOCAL_ROOT, key)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes, { mode: 0o600 })
  return key
}

export const readEncrypted = async (key: string): Promise<Buffer> => {
  ownKey(key)
  const storeId = kycStoreId()
  if (storeId) {
    const result = await get(key, {
      ...(await credentials(storeId)),
      access: 'private',
      useCache: false,
    })
    if (!result || result.statusCode !== 200 || !result.stream)
      throw new KycStoreError('KYC document not found')
    return Buffer.from(await new Response(result.stream).arrayBuffer())
  }
  refuseWithoutStore()
  const file = path.join(LOCAL_ROOT, key)
  if (!file.startsWith(LOCAL_ROOT)) throw new KycStoreError('Bad document key')
  return readFile(file)
}

export const deleteEncrypted = async (key: string): Promise<void> => {
  ownKey(key)
  const storeId = kycStoreId()
  if (storeId) {
    await del(key, await credentials(storeId))
    return
  }
  refuseWithoutStore()
  const file = path.join(LOCAL_ROOT, key)
  if (file.startsWith(LOCAL_ROOT)) await rm(file, { force: true })
}
