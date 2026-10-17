// Server code only, loaded by the Payload config; see src/storage/privateMedia.ts on why it
// does not import 'server-only'

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Every file the site keeps, behind one interface, so where they live is a setting and not code
 * (docs/COSTS.md, "Moving media to Cloudflare R2"):
 *
 *   media     the public site's pictures (the `media` collection). Payload's own storage plugins
 *             serve these (src/storage/mediaPlugin.ts); this interface is how the copy script
 *             moves them
 *   private   KYC documents (already encrypted) and artists' pictures: kyc/ and media/ folders
 *             per environment, never public, served only through the app
 *
 * Each is on one of:
 *
 *   vercel-blob   today. The public store with its read-write token; the private store
 *                 (KYC_STORE_ID) with the deployment's OIDC token, checked never to be the public one
 *   s3            any S3-compatible store: Cloudflare R2, Backblaze B2. Its own bucket per role
 *   local         development only: .uploads/ on disk, git-ignored
 *
 * MEDIA_STORAGE and PRIVATE_STORAGE choose (vercel-blob when unset); src/env.ts checks the
 * settings each needs. Nothing calling this knows or cares which it is.
 */

export type StoreRole = 'media' | 'private'
export type Driver = 'vercel-blob' | 's3' | 'local'

export type PutOptions = {
  contentType: string
  /** Refuse to replace a file already there (KYC documents are never overwritten) */
  overwrite?: boolean
  /** How long a cache may keep it */
  cacheSeconds?: number
}

export type StoredObject = { key: string; size: number }

export type ObjectStore = {
  driver: Driver
  put: (key: string, bytes: Buffer, options: PutOptions) => Promise<void>
  /** The file's bytes, or null if there is none */
  get: (key: string) => Promise<Buffer | null>
  exists: (key: string) => Promise<boolean>
  delete: (key: string) => Promise<void>
  /** Everything under a prefix, a page at a time behind the scenes */
  list: (prefix: string) => AsyncGenerator<StoredObject>
}

export class StoreError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message)
    this.name = 'StoreError'
  }
}

type Env = Record<string, string | undefined>

/** Which driver a role uses here, from the settings */
export const driverFor = (role: StoreRole, env: Env = process.env): Driver => {
  const setting = (role === 'media' ? env.MEDIA_STORAGE : env.PRIVATE_STORAGE)?.trim()
  if (setting === 's3') return 's3'
  if (setting && setting !== 'vercel-blob') {
    throw new StoreError(
      `${role === 'media' ? 'MEDIA' : 'PRIVATE'}_STORAGE "${setting}" is unknown`,
    )
  }
  const configured = role === 'media' ? env.BLOB_READ_WRITE_TOKEN : env.KYC_STORE_ID
  if (configured?.trim()) return 'vercel-blob'
  // Never by accident in production: a serverless disk is thrown away, and private files must
  // never fall back to anywhere else
  if (env.NODE_ENV === 'production') {
    throw new StoreError(
      role === 'media'
        ? 'BLOB_READ_WRITE_TOKEN is not set; media cannot be stored'
        : 'KYC_STORE_ID is not set; private files cannot be stored',
    )
  }
  return 'local'
}

/* ─── Vercel Blob ───────────────────────────────────────────────────────── */

const normaliseStoreId = (id: string | undefined) =>
  (id ?? '')
    .trim()
    .replace(/^store_/i, '')
    .toLowerCase()

const vercelBlob = (role: StoreRole, env: Env): ObjectStore => {
  const auth = async () => {
    if (role === 'media') return { token: env.BLOB_READ_WRITE_TOKEN?.trim() ?? '' }
    const storeId = env.KYC_STORE_ID?.trim() ?? ''
    // @vercel/blob would otherwise reach for the public store's credentials
    if (normaliseStoreId(storeId) === normaliseStoreId(env.BLOB_STORE_ID)) {
      throw new StoreError('KYC_STORE_ID is the public media store; refusing to use it')
    }
    const { getVercelOidcToken } = await import('@vercel/oidc')
    let oidcToken = ''
    try {
      oidcToken = (await getVercelOidcToken()).trim()
    } catch {
      // Handled below
    }
    if (!oidcToken) throw new StoreError('The private store cannot be reached from here')
    return { oidcToken, storeId }
  }
  const access = role === 'media' ? ('public' as const) : ('private' as const)
  return {
    driver: 'vercel-blob',
    put: async (key, bytes, options) => {
      const { del, put } = await import('@vercel/blob')
      const credentials = await auth()
      const result = await put(key, bytes, {
        ...credentials,
        access,
        contentType: options.contentType,
        addRandomSuffix: false,
        allowOverwrite: options.overwrite ?? true,
        cacheControlMaxAge: options.cacheSeconds ?? 60,
      } as never)
      if (role === 'private') {
        // The file must have landed in a private store, and in this one
        const host = new URL(result.url).hostname
        const storeId = normaliseStoreId(env.KYC_STORE_ID)
        if (!host.endsWith('.private.blob.vercel-storage.com') || !host.startsWith(`${storeId}.`)) {
          await del(result.url, credentials as never).catch(() => undefined)
          throw new StoreError('A private file went to the wrong store and was removed')
        }
      }
    },
    get: async (key) => {
      const { get } = await import('@vercel/blob')
      const result = await get(key, { ...(await auth()), access, useCache: false } as never)
      if (!result || result.statusCode !== 200 || !result.stream) return null
      return Buffer.from(await new Response(result.stream).arrayBuffer())
    },
    exists: async (key) => {
      const { head } = await import('@vercel/blob')
      try {
        await head(key, (await auth()) as never)
        return true
      } catch {
        return false
      }
    },
    delete: async (key) => {
      const { del } = await import('@vercel/blob')
      await del(key, (await auth()) as never)
    },
    list: async function* (prefix) {
      const { list } = await import('@vercel/blob')
      let cursor: string | undefined
      do {
        const page = await list({ ...(await auth()), prefix, cursor, limit: 1000 } as never)
        for (const blob of page.blobs) yield { key: blob.pathname, size: blob.size }
        cursor = page.hasMore ? page.cursor : undefined
      } while (cursor)
    },
  }
}

/* ─── S3-compatible (Cloudflare R2, Backblaze B2) ───────────────────────── */

export const s3Settings = (role: StoreRole, env: Env = process.env) => {
  const bucket = (role === 'media' ? env.S3_MEDIA_BUCKET : env.S3_PRIVATE_BUCKET)?.trim()
  const endpoint = env.S3_ENDPOINT?.trim()
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim()
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new StoreError(
      `S3 storage for ${role} needs S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_${role === 'media' ? 'MEDIA' : 'PRIVATE'}_BUCKET`,
    )
  }
  if (role === 'private' && bucket === env.S3_MEDIA_BUCKET?.trim()) {
    throw new StoreError('S3_PRIVATE_BUCKET is the public media bucket; refusing to use it')
  }
  return {
    bucket,
    config: {
      endpoint,
      // R2 takes "auto"; B2 its own region, such as us-west-004
      region: env.S3_REGION?.trim() || 'auto',
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      // Checksums only where S3 itself requires them: the SDK's newer default headers are not
      // understood by every S3-compatible store (R2 and B2 both advise this)
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    },
  }
}

const s3 = (role: StoreRole, env: Env): ObjectStore => {
  const { bucket, config } = s3Settings(role, env)
  let client: Promise<import('@aws-sdk/client-s3').S3Client> | undefined
  const sdk = () => import('@aws-sdk/client-s3')
  const connect = () => (client ??= sdk().then(({ S3Client }) => new S3Client(config)))
  const missing = (error: unknown) => {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
    return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404
  }
  return {
    driver: 's3',
    put: async (key, bytes, options) => {
      const { PutObjectCommand } = await sdk()
      await (
        await connect()
      ).send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: options.contentType,
          CacheControl: `${role === 'media' ? 'public' : 'private'}, max-age=${options.cacheSeconds ?? 60}`,
          // Refused by the store if the key exists, rather than checked first and raced
          ...(options.overwrite === false ? { IfNoneMatch: '*' } : {}),
        }),
      )
    },
    get: async (key) => {
      const { GetObjectCommand } = await sdk()
      try {
        const result = await (
          await connect()
        ).send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        return result.Body ? Buffer.from(await result.Body.transformToByteArray()) : null
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
    },
    exists: async (key) => {
      const { HeadObjectCommand } = await sdk()
      try {
        await (await connect()).send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch (error) {
        if (missing(error)) return false
        throw error
      }
    },
    delete: async (key) => {
      const { DeleteObjectCommand } = await sdk()
      await (await connect()).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
    list: async function* (prefix) {
      const { ListObjectsV2Command } = await sdk()
      let token: string | undefined
      do {
        const page = await (
          await connect()
        ).send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        )
        for (const item of page.Contents ?? []) {
          if (item.Key) yield { key: item.Key, size: item.Size ?? 0 }
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
    },
  }
}

/* ─── Local disk (development) ──────────────────────────────────────────── */

const local = (root: string): ObjectStore => {
  const fileOf = (key: string) => {
    const file = path.join(root, key)
    if (!file.startsWith(root + path.sep)) throw new StoreError('Bad key', 404)
    return file
  }
  const walk = async function* (dir: string): AsyncGenerator<string> {
    let entries: import('node:fs').Dirent[] = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) yield* walk(full)
      else yield full
    }
  }
  return {
    driver: 'local',
    put: async (key, bytes, options) => {
      const file = fileOf(key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, bytes, { mode: 0o600, flag: options.overwrite === false ? 'wx' : 'w' })
    },
    get: async (key) => {
      try {
        return await readFile(fileOf(key))
      } catch {
        return null
      }
    },
    exists: async (key) => {
      try {
        await stat(fileOf(key))
        return true
      } catch {
        return false
      }
    },
    delete: async (key) => {
      await rm(fileOf(key), { force: true })
    },
    list: async function* (prefix) {
      for await (const file of walk(path.join(root, path.dirname(`${prefix}x`)))) {
        const key = path.relative(root, file).split(path.sep).join('/')
        if (key.startsWith(prefix)) yield { key, size: (await stat(file)).size }
      }
    },
  }
}

/**
 * The store for a role, as configured. `driver` names one instead (the copy script); `localRoot`
 * is the folder used on a developer's machine, where KYC documents and artists' pictures have
 * always been kept apart (.uploads/kyc, .uploads/media)
 */
export const storeFor = (
  role: StoreRole,
  { driver, localRoot, env = process.env }: { driver?: Driver; localRoot?: string; env?: Env } = {},
): ObjectStore => {
  const chosen = driver ?? driverFor(role, env)
  if (chosen === 's3') return s3(role, env)
  if (chosen === 'vercel-blob') return vercelBlob(role, env)
  return local(
    path.resolve(process.cwd(), localRoot ?? (role === 'media' ? 'public/media' : '.uploads')),
  )
}
