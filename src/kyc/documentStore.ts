import 'server-only'

import { storeFor } from '@/storage/objectStore'

/**
 * Where encrypted KYC documents are kept. Everything stored here is already ciphertext
 * (src/kyc/crypto.ts), so even a leaked file is unreadable without the master key.
 *
 * The private store (src/storage/objectStore.ts): on Vercel the private Blob store pjk-kyc
 * (KYC_STORE_ID), reached with the deployment's OIDC token, never the public store's credentials;
 * or an S3-compatible private bucket once PRIVATE_STORAGE says so; locally .uploads/kyc on disk,
 * outside public/, git-ignored. Nothing in it has a public URL.
 *
 * Production and previews share the store, so each environment has its own folder (kyc/ for
 * production, preview/kyc/ for previews), and a document outside the current environment's folder
 * can be neither read nor deleted: a preview's purge, working on a database branched from
 * production, cannot touch production's files.
 */

export class KycStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KycStoreError'
  }
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

const store = () => storeFor('private', { localRoot: '.uploads/kyc' })

/** Stores ciphertext under a random name; returns the key to find it again */
export const storeEncrypted = async (name: string, bytes: Buffer): Promise<string> => {
  const key = ownKey(`${kycPrefix()}${name}`)
  await store().put(key, bytes, {
    contentType: 'application/octet-stream',
    overwrite: false,
    cacheSeconds: 60,
  })
  return key
}

export const readEncrypted = async (key: string): Promise<Buffer> => {
  ownKey(key)
  const bytes = await store().get(key)
  if (!bytes) throw new KycStoreError('KYC document not found')
  return bytes
}

export const deleteEncrypted = async (key: string): Promise<void> => {
  ownKey(key)
  await store().delete(key)
}
