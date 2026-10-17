// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseEnv } from '@/env'
import { driverFor, s3Settings, storeFor } from '@/storage/objectStore'

/*
 * Every file the site keeps goes through one interface (src/storage/objectStore.ts), so moving
 * storage is a setting. The S3 driver is tested against a small stand-in for an S3-compatible
 * store, run here; nothing reaches Vercel, Cloudflare or anyone else.
 */

/** Enough of the S3 API for the driver: put (honouring If-None-Match), get, head, delete, list */
const fakeS3 = () => {
  const objects = new Map<string, { body: Buffer; type: string }>()
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const [, bucket, ...rest] = url.pathname.split('/')
    const key = decodeURIComponent(rest.join('/'))
    const id = `${bucket}/${key}`
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const notFound = (code: string) => {
      res.writeHead(404, { 'content-type': 'application/xml' })
      res.end(req.method === 'HEAD' ? undefined : `<Error><Code>${code}</Code></Error>`)
    }
    if (req.method === 'GET' && !key && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? ''
      const items = [...objects.entries()]
        .filter(([k]) => k.startsWith(`${bucket}/${prefix}`))
        .map(
          ([k, v]) =>
            `<Contents><Key>${k.slice(bucket.length + 1)}</Key><Size>${v.body.length}</Size></Contents>`,
        )
      res.writeHead(200, { 'content-type': 'application/xml' })
      res.end(
        `<ListBucketResult><IsTruncated>false</IsTruncated>${items.join('')}</ListBucketResult>`,
      )
    } else if (req.method === 'PUT') {
      if (req.headers['if-none-match'] === '*' && objects.has(id)) {
        res.writeHead(412, { 'content-type': 'application/xml' })
        res.end('<Error><Code>PreconditionFailed</Code></Error>')
        return
      }
      objects.set(id, { body: Buffer.concat(chunks), type: String(req.headers['content-type']) })
      res.writeHead(200, { etag: '"x"' })
      res.end()
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      const found = objects.get(id)
      if (!found) return notFound('NoSuchKey')
      res.writeHead(200, { 'content-type': found.type, 'content-length': found.body.length })
      res.end(req.method === 'HEAD' ? undefined : found.body)
    } else if (req.method === 'DELETE') {
      objects.delete(id)
      res.writeHead(204)
      res.end()
    } else {
      res.writeHead(400)
      res.end()
    }
  })
  return { server, objects }
}

let s3: ReturnType<typeof fakeS3>
let endpoint: string
let scratch: string

beforeAll(async () => {
  s3 = fakeS3()
  await new Promise<void>((resolve) => s3.server.listen(0, '127.0.0.1', resolve))
  endpoint = `http://127.0.0.1:${(s3.server.address() as AddressInfo).port}`
  scratch = await mkdtemp(path.join(tmpdir(), 'pjk-store-'))
})

afterAll(async () => {
  await new Promise((resolve) => (s3.server as Server).close(resolve))
  await rm(scratch, { recursive: true, force: true })
})

const s3Env = () => ({
  NODE_ENV: 'test',
  MEDIA_STORAGE: 's3',
  PRIVATE_STORAGE: 's3',
  S3_ENDPOINT: endpoint,
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'example-access-key',
  S3_SECRET_ACCESS_KEY: 'example-secret-key-not-real',
  S3_MEDIA_BUCKET: 'pjk-media',
  S3_PRIVATE_BUCKET: 'pjk-private',
})

describe('choosing where files go', () => {
  it('is Vercel Blob when connected, local disk in development, and S3 only when asked', () => {
    expect(driverFor('media', { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x' })).toBe('vercel-blob')
    expect(driverFor('private', { KYC_STORE_ID: 'store_x' })).toBe('vercel-blob')
    expect(driverFor('media', { NODE_ENV: 'development' })).toBe('local')
    expect(
      driverFor('media', { MEDIA_STORAGE: 's3', BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x' }),
    ).toBe('s3')
    expect(driverFor('private', { PRIVATE_STORAGE: 's3', KYC_STORE_ID: 'store_x' })).toBe('s3')
  })

  it('never falls back to local disk in production, and refuses an unknown store', () => {
    expect(() => driverFor('media', { NODE_ENV: 'production' })).toThrow(/BLOB_READ_WRITE_TOKEN/)
    expect(() => driverFor('private', { NODE_ENV: 'production' })).toThrow(/KYC_STORE_ID/)
    expect(() => driverFor('media', { MEDIA_STORAGE: 'dropbox' })).toThrow(/unknown/)
  })

  it('never keeps private files in the public bucket', () => {
    expect(() => s3Settings('private', { ...s3Env(), S3_PRIVATE_BUCKET: 'pjk-media' })).toThrow(
      /public media bucket/,
    )
  })

  it('checks that each choice has the settings it needs', () => {
    const base = { DATABASE_URL: 'postgres://u:p@localhost/db', PAYLOAD_SECRET: 'x'.repeat(40) }
    const { problems } = parseEnv({ ...base, MEDIA_STORAGE: 's3' })
    expect(problems.join('\n')).toMatch(/S3_ENDPOINT is required/)
    expect(problems.join('\n')).toMatch(/S3_MEDIA_BUCKET is required/)
    // In production, choosing S3 for media means the Blob token is no longer required
    const production = parseEnv({
      ...base,
      ...s3Env(),
      S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      VERCEL_ENV: 'production',
    })
    expect(production.problems.join('\n')).not.toMatch(/BLOB_READ_WRITE_TOKEN|KYC_STORE_ID/)
  })
})

describe.each([
  ['an S3-compatible store', () => storeFor('private', { env: s3Env() })],
  ['local disk', () => storeFor('private', { driver: 'local', localRoot: scratch })],
])('%s', (_name, make) => {
  it('stores, reads, lists and deletes', async () => {
    const store = make()
    await store.put('kyc/a.bin', Buffer.from('ciphertext one'), {
      contentType: 'application/octet-stream',
    })
    await store.put('kyc/b.bin', Buffer.from('two'), { contentType: 'application/octet-stream' })
    expect((await store.get('kyc/a.bin'))?.toString()).toBe('ciphertext one')
    expect(await store.exists('kyc/a.bin')).toBe(true)
    expect(await store.get('kyc/missing.bin')).toBeNull()
    expect(await store.exists('kyc/missing.bin')).toBe(false)
    const listed = []
    for await (const item of store.list('kyc/')) listed.push(item)
    expect(listed.sort((x, y) => x.key.localeCompare(y.key))).toEqual([
      { key: 'kyc/a.bin', size: 14 },
      { key: 'kyc/b.bin', size: 3 },
    ])
    await store.delete('kyc/a.bin')
    expect(await store.exists('kyc/a.bin')).toBe(false)
  })

  it('refuses to overwrite when told not to', async () => {
    const store = make()
    await store.put('kyc/once.bin', Buffer.from('first'), {
      contentType: 'application/octet-stream',
      overwrite: false,
    })
    await expect(
      store.put('kyc/once.bin', Buffer.from('second'), {
        contentType: 'application/octet-stream',
        overwrite: false,
      }),
    ).rejects.toBeTruthy()
    expect((await store.get('kyc/once.bin'))?.toString()).toBe('first')
  })
})

describe('the S3 driver', () => {
  it('keeps media and private files in their own buckets', async () => {
    await storeFor('media', { env: s3Env() }).put('logo.svg', Buffer.from('<svg/>'), {
      contentType: 'image/svg+xml',
    })
    await storeFor('private', { env: s3Env() }).put('media/x.jpg', Buffer.from('jpg'), {
      contentType: 'image/jpeg',
    })
    expect(s3.objects.get('pjk-media/logo.svg')?.type).toBe('image/svg+xml')
    expect(s3.objects.has('pjk-private/media/x.jpg')).toBe(true)
    expect(s3.objects.has('pjk-media/media/x.jpg')).toBe(false)
  })
})
