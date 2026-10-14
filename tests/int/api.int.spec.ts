import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { p, root } from '@/seed/lexical'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Integration tests against the database in DATABASE_URL. They create two throwaway brands
 * ("int-test-a", "int-test-b") and remove everything they created afterwards.
 */
let payload: Payload
const context = { disableRevalidate: true }
const tenantIds: number[] = []

const layout = [{ blockType: 'pageIntro', heading: 'Test' }]

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  for (const slug of ['int-test-a', 'int-test-b']) {
    const t = await payload.create({ collection: 'tenants', context, data: { name: slug, slug } })
    tenantIds.push(t.id)
  }
})

afterAll(async () => {
  await cleanup()
})

async function cleanup() {
  const { docs } = await payload.find({
    collection: 'tenants',
    where: { slug: { in: ['int-test-a', 'int-test-b'] } },
  })
  for (const t of docs) {
    for (const collection of ['form-submissions', 'pages', 'forms'] as const) {
      await payload.delete({ collection, where: { tenant: { equals: t.id } }, context })
    }
    await payload.delete({ collection: 'tenants', id: t.id, context })
  }
}

describe('brands (multi-tenant)', () => {
  it('lets every brand have its own "home" page', async () => {
    for (const tenant of tenantIds) {
      const page = await payload.create({
        collection: 'pages',
        context,
        data: { tenant, title: 'Home', slug: 'home', _status: 'published', layout } as never,
      })
      expect(page.slug).toBe('home')
    }
  })

  it('rejects a duplicate slug within the same brand', async () => {
    await expect(
      payload.create({
        collection: 'pages',
        context,
        data: {
          tenant: tenantIds[0],
          title: 'Home again',
          slug: 'home',
          _status: 'published',
          layout,
        } as never,
      }),
    ).rejects.toThrow()
  })
})

describe('form submissions', () => {
  let formId: number

  beforeAll(async () => {
    const form = await payload.create({
      collection: 'forms',
      context,
      data: {
        tenant: tenantIds[1],
        title: 'Int test form',
        confirmationType: 'message',
        confirmationMessage: root(p('Thanks')),
        fields: [
          { blockType: 'text', name: 'full-name', label: 'Full name', required: true },
          { blockType: 'email', name: 'email', label: 'Email', required: true },
        ],
      } as never,
    })
    formId = form.id
  })

  it('files a valid submission under the form’s brand and drops unknown fields', async () => {
    const submission = await payload.create({
      collection: 'form-submissions',
      context,
      data: {
        form: formId,
        submissionData: [
          { field: 'full-name', value: 'Ada' },
          { field: 'email', value: 'ada@example.com' },
          { field: 'not-on-form', value: 'x' },
          { field: 'company_website', value: '' },
        ],
      },
    })
    const tenant = typeof submission.tenant === 'object' ? submission.tenant?.id : submission.tenant
    expect(tenant).toBe(tenantIds[1])
    expect(submission.submissionData?.map((d) => d.field)).toEqual(['full-name', 'email'])
  })

  it('rejects bots that fill the honeypot', async () => {
    await expect(
      payload.create({
        collection: 'form-submissions',
        context,
        data: {
          form: formId,
          submissionData: [
            { field: 'full-name', value: 'Bot' },
            { field: 'email', value: 'bot@example.com' },
            { field: 'company_website', value: 'http://spam.example' },
          ],
        },
      }),
    ).rejects.toThrow()
  })

  it('rejects submissions missing required fields', async () => {
    await expect(
      payload.create({
        collection: 'form-submissions',
        context,
        data: { form: formId, submissionData: [{ field: 'full-name', value: 'Ada' }] },
      }),
    ).rejects.toThrow(/Email/)
  })
})

describe('what the public API gives away', () => {
  it('shows a form but not the inboxes it notifies', async () => {
    const form = await payload.create({
      collection: 'forms',
      context,
      data: {
        tenant: tenantIds[0],
        title: 'Int test notified form',
        confirmationType: 'message',
        confirmationMessage: root(p('Thanks')),
        fields: [{ blockType: 'text', name: 'full-name', label: 'Full name', required: true }],
        emails: [{ emailTo: 'inbox@example.test', subject: 'New enquiry' }],
      } as never,
    })

    // A visitor, and someone signed in who is not staff (the shape a member will have)
    const outsider = { id: 999_999, email: 'outsider@example.test', collection: 'members' }
    for (const user of [undefined, outsider]) {
      const seen = await payload.findByID({
        collection: 'forms',
        id: form.id,
        overrideAccess: false,
        depth: 0,
        user: user as never,
      })
      expect(seen.title).toBe('Int test notified form')
      // Payload may hand back an empty list in its place; what matters is the address is not there
      expect(JSON.stringify(seen)).not.toContain('inbox@example.test')
    }

    const asServer = await payload.findByID({ collection: 'forms', id: form.id, depth: 0 })
    expect(asServer.emails?.[0]?.emailTo).toBe('inbox@example.test')
  })

  it('has no GraphQL endpoint', () => {
    expect(payload.config.graphQL.disable).toBe(true)
  })

  it('caps how deep a read may populate', () => {
    expect(payload.config.maxDepth).toBeLessThanOrEqual(4)
  })
})

describe('the deep health check', () => {
  it('is for staff only, and lists anything the site needs that is missing', async () => {
    const { GET } = await import('@/app/(payload)/api/health/route')
    const { getPayload } = await import('payload')
    const config = (await import('@/payload.config')).default
    const payload = await getPayload({ config: await config })
    const visitor = await GET(new Request('http://localhost:3000/api/health?deep=1'))
    expect(visitor.status).toBe(401)
    expect(await visitor.text()).not.toContain('missing')
    const spy = vi
      .spyOn(payload, 'auth')
      .mockResolvedValueOnce({ user: { id: 1, collection: 'users', roles: ['editor'] } } as never)
    const staff = await GET(new Request('http://localhost:3000/api/health?deep=1'))
    spy.mockRestore()
    const body = (await staff.json()) as {
      content: { ok: boolean; checked: number; missing: string[] }
    }
    // Whatever this database holds: a list of what is missing, and a status that matches it
    expect(body.content.checked).toBeGreaterThan(0)
    expect(Array.isArray(body.content.missing)).toBe(true)
    expect(body.content.ok).toBe(body.content.missing.length === 0)
    expect(staff.status).toBe(body.content.ok ? 200 : 503)
  })
})
