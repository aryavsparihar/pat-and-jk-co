import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { addWaysIn, pointOpeningsAtPaths } from '@/migrations/20261004_090000_collaborate_ways_in'

/**
 * The one-time migration that gives the live collaborate page its two ways in. Run against a
 * throwaway brand ("int-test-collab") with a page shaped like the live one: published, with an
 * unpublished draft on top that must stay unpublished.
 */
let payload: Payload
let tenant: number
const context = { disableRevalidate: true }
const SLUG = 'int-test-collab'

const db = () => payload.db.drizzle as never

const whoWeWorkWith = {
  blockType: 'principles',
  eyebrow: 'Who we work with',
  numbering: 'none',
  items: [
    { title: 'Artists', text: 'Fine and contemporary artists.' },
    { title: 'Partners', text: 'Galleries and institutions.' },
  ],
}
const layout = [
  { blockType: 'pageIntro', eyebrow: 'Collaborate', heading: 'Work with us' },
  whoWeWorkWith,
  { blockType: 'openings', eyebrow: 'Open calls', heading: 'Current openings' },
]

async function cleanup() {
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: SLUG } } })
  for (const t of docs) {
    for (const collection of ['pages', 'openings'] as const) {
      await payload.delete({ collection, where: { tenant: { equals: t.id } }, context })
    }
    await payload.delete({ collection: 'tenants', id: t.id, context })
  }
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  tenant = (
    await payload.create({ collection: 'tenants', context, data: { name: SLUG, slug: SLUG } })
  ).id
})

afterAll(async () => {
  await cleanup()
})

const shape = (blocks: { blockType: string; eyebrow?: string | null }[]) =>
  blocks.map((b) => `${b.blockType}${b.eyebrow ? `:${b.eyebrow}` : ''}`)

describe('the collaborate page migration', () => {
  it('adds the two ways in and how it works, without publishing the draft', async () => {
    const page = await payload.create({
      collection: 'pages',
      context,
      data: {
        tenant,
        title: 'Collaborate',
        slug: 'collaborate',
        _status: 'published',
        layout,
      } as never,
    })
    const published = await payload.findByID({ collection: 'pages', id: page.id, context })
    // An editor's unpublished draft
    await payload.update({
      collection: 'pages',
      id: page.id,
      draft: true,
      context,
      data: { title: 'Collaborate (draft)' } as never,
    })
    const versionsBefore = (
      await payload.findVersions({ collection: 'pages', where: { parent: { equals: page.id } } })
    ).totalDocs

    expect(await addWaysIn(db(), tenant)).toEqual(['Two ways to begin', 'How it works'])

    const expected = [
      'pageIntro:Collaborate',
      'paths:Apply',
      'principles:Who we work with',
      'principles:How it works',
      'openings:Open calls',
    ]
    const live = await payload.findByID({ collection: 'pages', id: page.id, context })
    expect(shape(live.layout as never)).toEqual(expected)
    expect(live.title).toBe('Collaborate')
    expect(live._status).toBe('published')
    // What was there is as it was, ids and all
    expect(live.layout![0]).toEqual(published.layout![0])
    expect(live.layout![2]).toEqual(published.layout![1])
    expect(live.layout![4]).toEqual(published.layout![2])
    const howItWorks = live.layout![3] as { items: { title: string }[]; numbering: string }
    expect(howItWorks.numbering).toBe('roman')
    expect(howItWorks.items.map((i) => i.title)).toEqual(['Apply', 'Conversation', 'Welcome'])

    // The admin opens the draft: it has them too, so publishing it keeps them
    const draft = await payload.findByID({ collection: 'pages', id: page.id, draft: true, context })
    expect(draft.title).toBe('Collaborate (draft)')
    expect(draft._status).toBe('draft')
    expect(shape(draft.layout as never)).toEqual(expected)
    expect(draft.layout![1]!.id).toBe(live.layout![1]!.id)

    // No new version was made
    expect(
      (await payload.findVersions({ collection: 'pages', where: { parent: { equals: page.id } } }))
        .totalDocs,
    ).toBe(versionsBefore)

    // Running again changes nothing
    expect(await addWaysIn(db(), tenant)).toEqual([])
    const again = await payload.findByID({ collection: 'pages', id: page.id, context })
    expect(shape(again.layout as never)).toEqual(expected)
  })

  it('points only the calls still sent to the contact form at the applications', async () => {
    const opening = (type: string, applyUrl: string) =>
      payload.create({
        collection: 'openings',
        context,
        data: { tenant, title: `${type} call`, type, summary: 'Made up.', applyUrl } as never,
      })
    const artist = await opening('artist', '/collaborate#form')
    const partner = await opening('partner', '/contact')
    const collaborator = await opening('collaborator', '/collaborate#form')
    const custom = await opening('artist', 'https://example.test/form')
    const role = await opening('role', '/collaborate#form')

    expect(await pointOpeningsAtPaths(db(), tenant)).toBe(3)
    const url = async (id: number) =>
      (await payload.findByID({ collection: 'openings', id, context })).applyUrl
    expect(await url(artist.id)).toBe('/collaborate/artists')
    expect(await url(partner.id)).toBe('/collaborate/partners')
    expect(await url(collaborator.id)).toBe('/collaborate/partners')
    expect(await url(custom.id)).toBe('https://example.test/form')
    expect(await url(role.id)).toBe('/collaborate#form')
  })
})
