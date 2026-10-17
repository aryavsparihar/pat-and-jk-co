/**
 * Copies files from Vercel Blob to the S3-compatible store (Cloudflare R2, Backblaze B2), the
 * one step besides settings in moving storage (docs/COSTS.md, "Moving media to Cloudflare R2").
 * Copies only what is missing or a different size at the destination, so it is safe to run again,
 * and never deletes anything: Vercel Blob stays as it was until you remove it yourself.
 *
 *   pnpm storage:copy media              lists what would be copied of the public media store
 *   pnpm storage:copy media --apply      copies it
 *   pnpm storage:copy private [--apply]  the same for KYC documents and artists' pictures, this
 *                                        environment's folders only (VERCEL_ENV)
 *
 * Needs both sides' settings: BLOB_READ_WRITE_TOKEN (media) or KYC_STORE_ID with a fresh OIDC
 * token from `vercel env pull` (private), and the S3_* settings. Prints counts and sizes, never
 * file contents.
 */
import 'dotenv/config'

import { storeFor, type StoreRole } from '../src/storage/objectStore'

const role = process.argv[2] as StoreRole
const apply = process.argv.includes('--apply')
if (role !== 'media' && role !== 'private') {
  console.error('Say which: pnpm storage:copy media|private [--apply]')
  process.exit(2)
}

const TYPES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}
const typeOf = (key: string) =>
  TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

const env = process.env.VERCEL_ENV
const prefixes =
  role === 'media'
    ? ['']
    : env === 'production'
      ? ['kyc/', 'media/']
      : [`${env || 'development'}/kyc/`, `${env || 'development'}/media/`]

const from = storeFor(role, { driver: 'vercel-blob' })
const to = storeFor(role, { driver: 's3' })

let copied = 0
let skipped = 0
let bytes = 0
for (const prefix of prefixes) {
  const there = new Map<string, number>()
  for await (const item of to.list(prefix)) there.set(item.key, item.size)
  for await (const item of from.list(prefix)) {
    if (there.get(item.key) === item.size) {
      skipped++
      continue
    }
    if (apply) {
      const body = await from.get(item.key)
      if (!body) continue
      await to.put(item.key, body, {
        contentType: role === 'private' ? 'application/octet-stream' : typeOf(item.key),
        cacheSeconds: role === 'media' ? 31_536_000 : 60,
      })
    }
    copied++
    bytes += item.size
  }
}

const size = `${(bytes / 1024 / 1024).toFixed(1)} MB`
console.log(
  apply
    ? `Copied ${copied} file(s), ${size}; ${skipped} already there.`
    : `Would copy ${copied} file(s), ${size}; ${skipped} already there. Run again with --apply.`,
)
process.exit(0)
