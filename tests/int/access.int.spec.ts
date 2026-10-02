import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { beforeAll, describe, expect, it } from 'vitest'

import { authenticated } from '@/access/authenticated'
import { authenticatedOrPublished } from '@/access/authenticatedOrPublished'
import { isStaff, isSuperAdmin } from '@/access/roles'

/**
 * Being signed in is not the same as being staff. Payload sets `req.user` for every auth
 * collection, so these tests use a user from a collection other than `users` — the shape a
 * member will have — and check it gets nothing a visitor would not.
 */
const outsider = { id: 999_999, email: 'outsider@example.test', collection: 'members' }
const staff = { id: 1, email: 'editor@pjk.co.in', roles: ['editor'], collection: 'users' }
const superAdmin = { ...staff, roles: ['super-admin'] }

const reqWith = (user: unknown) => ({ req: { user } }) as never

describe('who counts as staff', () => {
  it('requires the staff collection, not just a signed-in user', () => {
    expect(isStaff(staff)).toBe(true)
    expect(isStaff(outsider)).toBe(false)
    expect(isStaff({ id: 1, roles: ['super-admin'] })).toBe(false)
    expect(isStaff(null)).toBe(false)
  })

  it('never treats an outsider as a super admin, whatever it claims', () => {
    expect(isSuperAdmin(superAdmin as never)).toBe(true)
    expect(isSuperAdmin({ ...outsider, roles: ['super-admin'] } as never)).toBe(false)
  })

  it('keeps drafts from anyone who is not staff', () => {
    expect(authenticated(reqWith(staff))).toBe(true)
    expect(authenticated(reqWith(outsider))).toBe(false)
    expect(authenticatedOrPublished(reqWith(staff))).toBe(true)
    expect(authenticatedOrPublished(reqWith(outsider))).toEqual({ _status: { equals: 'published' } })
  })
})

describe('a signed-in outsider through the Local API', () => {
  let payload: Payload
  const as = { user: outsider as never, overrideAccess: false } as const

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('cannot create a page or a category', async () => {
    await expect(
      payload.create({
        collection: 'pages',
        data: { title: 'Nope', slug: 'nope', layout: [] } as never,
        ...as,
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: 'categories', data: { title: 'Nope' } as never, ...as }),
    ).rejects.toThrow()
  })

  it('cannot read brands, enquiries, staff accounts or the security log', async () => {
    for (const collection of ['tenants', 'form-submissions', 'users', 'security-events'] as const) {
      await expect(payload.find({ collection, ...as })).rejects.toThrow()
    }
  })

  it('sees only what a visitor sees', async () => {
    const pages = await payload.find({ collection: 'pages', depth: 0, limit: 100, ...as })
    expect(pages.docs.every((p) => p._status === 'published')).toBe(true)
    const openings = await payload.find({ collection: 'openings', depth: 0, limit: 100, ...as })
    expect(openings.docs.every((o) => o.status === 'open')).toBe(true)
  })
})

describe('the member guard over collections that are not ours', () => {
  let payload: Payload
  const as = { user: outsider as never, overrideAccess: false } as const

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  it('stops a signed-in outsider creating forms, redirects or folders', async () => {
    await expect(
      payload.create({
        collection: 'forms',
        data: { title: 'Nope', fields: [], confirmationType: 'message' } as never,
        ...as,
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'redirects',
        data: { from: '/nope', to: { type: 'custom', url: '/' } } as never,
        ...as,
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: 'payload-folders', data: { name: 'Nope' } as never, ...as }),
    ).rejects.toThrow()
  })

  it("keeps Payload's own records out of reach", async () => {
    for (const collection of [
      'payload-jobs',
      'payload-locked-documents',
      'payload-preferences',
      'payload-migrations',
      'payload-kv',
      'rate-limits',
      'login-challenges',
    ] as const) {
      await expect(payload.find({ collection, ...as })).rejects.toThrow()
    }
  })

  it('cannot queue a job or open the admin panel', async () => {
    const req = { user: outsider, headers: new Headers() } as never
    expect(await payload.config.jobs.access!.queue!({ req })).toBe(false)
    expect(await payload.config.jobs.access!.run!({ req })).toBe(false)
    const users = payload.collections.users.config.access
    expect(await users.admin!({ req })).toBe(false)
  })

  it('still reads what any visitor can', async () => {
    const forms = await payload.find({ collection: 'forms', depth: 0, limit: 1, ...as })
    expect(Array.isArray(forms.docs)).toBe(true)
    const media = await payload.find({ collection: 'media', depth: 0, limit: 1, ...as })
    expect(Array.isArray(media.docs)).toBe(true)
  })

  it('leaves staff exactly as they were', async () => {
    const tenants = await payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 1,
      user: { ...staff, roles: ['super-admin'] } as never,
      overrideAccess: false,
    })
    expect(Array.isArray(tenants.docs)).toBe(true)
  })
})
