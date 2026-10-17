// Server code only: it is loaded by the Payload config (the storage plugin), which Payload's own
// command-line tool also reads, so it cannot carry `import 'server-only'`; nothing in the browser
// imports it

import { storeFor } from './objectStore'

/**
 * Where artists' pictures are kept while only they and staff may see them: their works, and their
 * portrait. Nothing stored here has a public URL. It is served only through the app, to the
 * artist and to staff (src/app/(frontend)/next/media, and Payload's file route for the admin),
 * never through a public link, the image optimiser or the CDN. Pictures for the public are copied
 * out to public storage when a work is published, and only then.
 *
 *   on Vercel            the private Blob store (KYC_STORE_ID), in its own media/ folder, reached
 *                        with the deployment's OIDC token, as KYC documents are (src/kyc)
 *   or                   an S3-compatible private bucket once PRIVATE_STORAGE says so
 *   local development    .uploads/media on disk, outside public/, git-ignored
 *
 * Which, and the checks that keep it private, are in src/storage/objectStore.ts.
 *
 * Production and previews share the store, so each environment has its own folder, and a key
 * outside the current environment's folder can be neither read nor deleted.
 */

export class PrivateMediaError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message)
    this.name = 'PrivateMediaError'
  }
}

/** This environment's folder: media/ in production, preview/media/ on previews, and so on */
export const mediaFolder = (): string => {
  const env = process.env.VERCEL_ENV
  return env === 'production' ? 'media' : `${env || 'development'}/media`
}

/** A key this environment may use: in its own folder, and nothing that could climb out of it */
export const ownMediaKey = (key: string): string => {
  if (!key.startsWith(`${mediaFolder()}/`) || key.includes('..') || !/^[a-z0-9/._-]+$/i.test(key)) {
    throw new PrivateMediaError('This file belongs elsewhere', 404)
  }
  return key
}

const store = () => storeFor('private', { localRoot: '.uploads/media' })

/** Stores a file privately under `key` (in this environment's folder) */
export const putPrivate = async (key: string, bytes: Buffer, contentType: string) => {
  ownMediaKey(key)
  await store().put(key, bytes, { contentType, overwrite: true, cacheSeconds: 60 })
}

/** The file's bytes, or null if there is none */
export const readPrivate = async (key: string): Promise<Buffer | null> => {
  ownMediaKey(key)
  return store().get(key)
}

export const existsPrivate = async (key: string): Promise<boolean> => {
  ownMediaKey(key)
  return store().exists(key)
}

export const deletePrivate = async (key: string): Promise<void> => {
  ownMediaKey(key)
  await store().delete(key)
}
