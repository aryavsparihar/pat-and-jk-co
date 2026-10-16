// Server code only, loaded by the Payload config; see src/storage/privateMedia.ts on why it
// does not import 'server-only'

import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'
import { del as delBlob } from '@vercel/blob'
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'

import {
  deletePrivate,
  mediaFolder,
  ownMediaKey,
  putPrivate,
  readPrivate,
} from './privateMedia'

/**
 * Payload's storage for the artists' pictures (portfolio-images): the private store
 * (src/storage/privateMedia.ts), never the public one. Payload's own file route serves them, after
 * checking the collection's read rule (staff, or the owner), so the admin works as before.
 *
 * Two economies, as Vercel's free plan counts every file written: only the picture itself and its
 * thumbnail are kept. Payload also makes a 1600 px "display" size, which nothing uses; it is not
 * written, and the setting goes in a later release (migrations only add).
 *
 * Pictures uploaded before this were kept in the public store. Each moves here the first time it
 * is asked for, and `pnpm media:make-private` moves the rest at once.
 */

/** Where this environment's portfolio pictures live in the private store */
export const portfolioFolder = () => `${mediaFolder()}/portfolio`

const LEGACY_LOCAL = path.resolve(process.cwd(), '.uploads/portfolio-images')

type ImageDoc = {
  id: number | string
  filename?: string | null
  prefix?: string | null
  mimeType?: string | null
  sizes?: Record<string, { filename?: string | null } | null | undefined> | null
}

/** Every stored file of an image: the picture and its sizes, except the unused display size */
const filesOf = (doc: ImageDoc): string[] =>
  [
    doc.filename,
    ...Object.entries(doc.sizes ?? {})
      .filter(([name]) => name !== 'display')
      .map(([, size]) => size?.filename),
  ].filter((f): f is string => Boolean(f))

const isPrivate = (prefix: string | null | undefined) =>
  Boolean(prefix) && `${prefix}/`.startsWith(`${mediaFolder()}/`)

/** The headers every private picture is sent with: never cached by anyone but the viewer */
export const privateFileHeaders = (contentType: string) => ({
  'Content-Type': contentType,
  'Cache-Control': 'private, max-age=600',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
})

const typeOf = (filename: string, fallback?: string | null) =>
  fallback ||
  ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[
    path.extname(filename).toLowerCase()
  ] ??
    'application/octet-stream')

/* ─── Pictures from before: in the public store, or on disk locally ─────── */

const publicStoreBase = () => {
  const id = (process.env.BLOB_STORE_ID ?? '').trim().replace(/^store_/i, '').toLowerCase()
  return id ? `https://${id}.public.blob.vercel-storage.com` : null
}

const readLegacy = async (prefix: string | null | undefined, filename: string) => {
  const base = publicStoreBase()
  if (base && process.env.BLOB_READ_WRITE_TOKEN) {
    const response = await fetch(`${base}/${prefix ? `${prefix}/` : ''}${filename}`, {
      redirect: 'error',
    })
    return response.ok ? Buffer.from(await response.arrayBuffer()) : null
  }
  try {
    return await readFile(path.join(LEGACY_LOCAL, path.basename(filename)))
  } catch {
    return null
  }
}

const deleteLegacy = async (prefix: string | null | undefined, filename: string) => {
  const base = publicStoreBase()
  if (base && process.env.BLOB_READ_WRITE_TOKEN) {
    await delBlob(`${base}/${prefix ? `${prefix}/` : ''}${filename}`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return
  }
  await rm(path.join(LEGACY_LOCAL, path.basename(filename)), { force: true })
}

/**
 * Moves one picture from where it was kept before into the private store: copies every file,
 * records the new place, and only then removes the old copies. Safe to run twice.
 */
export const makeImagePrivate = async (payload: Payload, doc: ImageDoc): Promise<boolean> => {
  if (isPrivate(doc.prefix)) return false
  const folder = portfolioFolder()
  for (const filename of filesOf(doc)) {
    const bytes = await readLegacy(doc.prefix, filename)
    if (!bytes) continue // already gone from the old place: nothing to copy
    await putPrivate(`${folder}/${filename}`, bytes, typeOf(filename, doc.mimeType))
  }
  await payload.update({
    collection: 'portfolio-images',
    id: doc.id,
    data: { prefix: folder } as never,
    overrideAccess: true,
    context: { disableRevalidate: true, movingToPrivate: true },
  })
  for (const filename of filesOf(doc)) {
    await deleteLegacy(doc.prefix, filename).catch(() => undefined)
  }
  return true
}

/* ─── The adapter ───────────────────────────────────────────────────────── */

export const privateMemberMedia: Adapter = () => ({
  name: 'private-member-media',

  handleUpload: async ({ data, file }) => {
    const display = (data as ImageDoc | undefined)?.sizes?.display?.filename
    if (display && file.filename === display) return
    await putPrivate(`${portfolioFolder()}/${file.filename}`, file.buffer, file.mimeType)
  },

  handleDelete: async ({ doc, filename }) => {
    const prefix = (doc as ImageDoc).prefix
    if (isPrivate(prefix)) {
      await deletePrivate(ownMediaKey(`${prefix}/${filename}`))
      return
    }
    await deleteLegacy(prefix, filename).catch(() => undefined)
  },

  staticHandler: async (req, { doc, params }) => {
    const filename = path.basename(params.filename)
    let image = doc as ImageDoc | undefined
    // A picture from before: move it to the private store now, then serve it from there
    if (image && !isPrivate(image.prefix)) {
      await makeImagePrivate(req.payload, image)
      image = { ...image, prefix: portfolioFolder() }
    }
    const prefix = image?.prefix ?? params.prefix ?? portfolioFolder()
    if (!isPrivate(prefix)) return new Response('Not found', { status: 404 })
    const bytes = await readPrivate(ownMediaKey(`${prefix}/${filename}`))
    if (!bytes) return new Response('Not found', { status: 404 })
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: privateFileHeaders(typeOf(filename, image?.mimeType)),
    })
  },
})
