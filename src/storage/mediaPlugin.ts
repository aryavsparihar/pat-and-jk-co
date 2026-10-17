// Server code only, loaded by the Payload config; see src/storage/privateMedia.ts on why it
// does not import 'server-only'

import { s3Storage } from '@payloadcms/storage-s3'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import type { Plugin } from 'payload'

import { driverFor, s3Settings } from './objectStore'

/**
 * Where the public site's pictures (the `media` collection) are kept, by setting: Vercel Blob
 * today, or an S3-compatible bucket such as Cloudflare R2 once MEDIA_STORAGE=s3 (docs/COSTS.md,
 * "Moving media to Cloudflare R2"). Both are Payload's own storage plugins, which serve files
 * through Payload's file route, so every picture keeps the same address on the site either way.
 *
 * Both add the same fields, so the schema does not change between them, and both plugins' upload
 * components are always in the admin's import map (payload.config.ts, admin.dependencies), so the
 * switch needs no code change and no new build step.
 */
export const mediaStoragePlugin = (): Plugin => {
  let driver: ReturnType<typeof driverFor> = 'local'
  try {
    driver = driverFor('media')
  } catch {
    // Not configured: src/env.ts has already said so in production, and locally the files go to
    // public/media as before
  }
  if (driver === 's3') {
    const { bucket, config } = s3Settings('media')
    return s3Storage({
      alwaysInsertFields: true,
      // The browser sends large files straight to the bucket with a signed link (the bucket needs
      // a CORS rule for the site, docs/COSTS.md), past Vercel's 4.5 MB request limit
      clientUploads: true,
      collections: { media: true },
      bucket,
      config,
    })
  }
  return vercelBlobStorage({
    // Enabled automatically on Vercel once a Blob store is connected; local dev writes to public/media
    enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    // Add the plugin's fields (the per-file `prefix` above all) whether or not it is enabled, so
    // the schema is the same locally, where migrations are generated, as on Vercel. Without this,
    // portfolio_images had no `prefix` column and every query on it failed once deployed.
    alwaysInsertFields: true,
    clientUploads: true,
    collections: {
      media: true,
    },
    token: process.env.BLOB_READ_WRITE_TOKEN || '',
  })
}

/** Both plugins' browser-upload components, kept in the import map whichever is in use */
export const MEDIA_UPLOAD_HANDLERS = {
  s3ClientUploadHandler: {
    type: 'component' as const,
    path: '@payloadcms/storage-s3/client#S3ClientUploadHandler',
  },
  vercelBlobClientUploadHandler: {
    type: 'component' as const,
    path: '@payloadcms/storage-vercel-blob/client#VercelBlobClientUploadHandler',
  },
}
