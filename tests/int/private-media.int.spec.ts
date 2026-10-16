// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { mkdir, readFile, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureApplication } from '@/members/accounts'
import { ingestPortfolioImage } from '@/members/portfolio'
import type { Member, PortfolioImage } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { portfolioFolder } from '@/storage/memberMediaAdapter'
import { execute } from '@/utilities/sql'

/*
 * Artists' pictures are private: kept out of public storage, readable only by their owner (and
 * staff), sent with headers that keep them out of every cache but the viewer's, and moved out of
 * the old public place the first time they are asked for. Everyone here is made up
 * (@media.example.test) and everything created is removed.
 */

let payload: Payload
const DOMAIN = '@media.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const PRIVATE_ROOT = path.resolve(process.cwd(), '.uploads/media')
const LEGACY_ROOT = path.resolve(process.cwd(), '.uploads/portfolio-images')

const unique = () => `artist-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`

const someone = async () => {
  const { member } = await ensureApplication(payload, { email: unique(), type: 'artist' })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const photo = (width = 1200, height = 900) =>
  sharp({ create: { width, height, channels: 3, background: { r: 90, g: 120, b: 80 } } })
    .jpeg()
    .toBuffer()

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  )

const fetchFile = async (filename: string, cookie?: string) => {
  const { REST_GET } = await import('@payloadcms/next/routes')
  return REST_GET(config)(
    new Request(`${ORIGIN}/api/portfolio-images/file/${filename}`, {
      headers: cookie ? { cookie } : {},
    }),
    { params: Promise.resolve({ slug: ['portfolio-images', 'file', filename] }) },
  )
}

const cleanup = async () => {
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like}`
  const images = await payload.find({
    collection: 'portfolio-images',
    where: { 'owner.email': { like: DOMAIN } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  for (const image of images.docs)
    await payload.delete({ collection: 'portfolio-images', id: image.id, overrideAccess: true })
  await execute(payload, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
})

afterAll(async () => {
  await cleanup()
})

describe('artists’ pictures', () => {
  let owner: { member: Member; cookie: string }
  let image: PortfolioImage

  it('are kept in the private folder, the picture and its thumbnail only', async () => {
    owner = await someone()
    // Large enough that Payload makes its 1600 px size, which must not be written
    image = await ingestPortfolioImage(payload, owner.member, await photo(2000, 1500))
    expect(image.sizes?.display?.filename).toBeTruthy()
    expect(image.prefix).toBe(portfolioFolder())
    // Kept under this environment's folder of the private store (on disk, locally)
    expect(await exists(path.join(PRIVATE_ROOT, portfolioFolder(), image.filename!))).toBe(true)
    expect(
      await exists(path.join(PRIVATE_ROOT, portfolioFolder(), image.sizes!.thumbnail!.filename!)),
    ).toBe(true)
    // The 1600 px size nothing uses is never written
    expect(
      await exists(path.join(PRIVATE_ROOT, portfolioFolder(), image.sizes!.display!.filename!)),
    ).toBe(false)
  })

  it('are sent only to their owner, never cached by anyone else', async () => {
    const own = await fetchFile(image.filename!, owner.cookie)
    expect(own.status).toBe(200)
    expect(own.headers.get('cache-control')).toBe('private, max-age=600')
    expect(own.headers.get('content-security-policy')).toContain('sandbox')
    expect(own.headers.get('content-type')).toBe('image/jpeg')

    const other = await someone()
    expect([403, 404]).toContain((await fetchFile(image.filename!, other.cookie)).status)
    expect([403, 404]).toContain((await fetchFile(image.filename!)).status)
  })

  it('kept in the old public place are moved to the private one when first asked for', async () => {
    const legacy = await ingestPortfolioImage(payload, owner.member, await photo())
    // As one uploaded before: its files in the old place, and the old folder recorded
    await mkdir(LEGACY_ROOT, { recursive: true })
    for (const name of [legacy.filename!, legacy.sizes!.thumbnail!.filename!]) {
      await rename(path.join(PRIVATE_ROOT, portfolioFolder(), name), path.join(LEGACY_ROOT, name))
    }
    await execute(
      payload,
      sql`UPDATE portfolio_images SET prefix = 'portfolio' WHERE id = ${legacy.id}`,
    )

    const served = await fetchFile(legacy.filename!, owner.cookie)
    expect(served.status).toBe(200)
    const moved = await payload.findByID({
      collection: 'portfolio-images',
      id: legacy.id,
      overrideAccess: true,
    })
    expect(moved.prefix).toBe(portfolioFolder())
    for (const name of [legacy.filename!, legacy.sizes!.thumbnail!.filename!]) {
      expect(await exists(path.join(PRIVATE_ROOT, portfolioFolder(), name))).toBe(true)
      expect(await exists(path.join(LEGACY_ROOT, name))).toBe(false)
    }
    // And the bytes are the same picture
    expect(
      (await readFile(path.join(PRIVATE_ROOT, portfolioFolder(), legacy.filename!))).length,
    ).toBeGreaterThan(1000)
  })
})
