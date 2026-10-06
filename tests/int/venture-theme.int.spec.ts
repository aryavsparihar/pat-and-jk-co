import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ventureTheme } from '@/brands/themes'
import { fillPhulhaarTheme } from '@/migrations/20261006_153600_phulhaar_venture_theme'

/**
 * A venture's Theme, and the one-time migration that sets Phulhaar's. Run against a throwaway
 * brand ("int-test-theme"), with a venture published and an unpublished draft on top.
 */
let payload: Payload
let tenant: number
const context = { disableRevalidate: true }
const SLUG = 'int-test-theme'

type Tx = { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> }
const fill = async () => {
  let ids: number[] = []
  // Payload runs each migration in a transaction; so does this
  await (payload.db.drizzle as unknown as Tx).transaction(async (tx) => {
    ids = await fillPhulhaarTheme(tx as never, SLUG)
  })
  return ids
}

async function cleanup() {
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: SLUG } } })
  for (const t of docs) {
    await payload.delete({ collection: 'ventures', where: { tenant: { equals: t.id } }, context })
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

describe('a venture’s theme', () => {
  it('is PJK’s style when empty, and a brand’s own when chosen', () => {
    expect(ventureTheme({ theme: null })).toBeNull()
    expect(ventureTheme({ theme: 'pjk' })).toBeNull()
    expect(ventureTheme({ theme: 'phulhaar' })).toMatchObject({
      className: 'brand-theme phulhaar',
      invite: { href: '/collaborate/artists' },
    })
  })

  it('is set for Phulhaar where empty, draft included, without publishing the draft', async () => {
    const venture = await payload.create({
      collection: 'ventures',
      context,
      data: {
        tenant,
        name: 'Phulhaar Gallery by PJK',
        slug: 'phulhaar-gallery',
        _status: 'published',
      } as never,
    })
    await payload.update({
      collection: 'ventures',
      id: venture.id,
      draft: true,
      context,
      data: { name: 'Phulhaar Gallery by PJK (draft)' } as never,
    })
    const versionsBefore = (
      await payload.findVersions({
        collection: 'ventures',
        where: { parent: { equals: venture.id } },
      })
    ).totalDocs

    expect(await fill()).toEqual([venture.id])

    const live = await payload.findByID({ collection: 'ventures', id: venture.id, context })
    expect(live.theme).toBe('phulhaar')
    expect(live.name).toBe('Phulhaar Gallery by PJK')
    const draft = await payload.findByID({
      collection: 'ventures',
      id: venture.id,
      draft: true,
      context,
    })
    expect(draft.theme).toBe('phulhaar')
    expect(draft._status).toBe('draft')
    expect(
      (
        await payload.findVersions({
          collection: 'ventures',
          where: { parent: { equals: venture.id } },
        })
      ).totalDocs,
    ).toBe(versionsBefore)

    // A second run changes nothing
    expect(await fill()).toEqual([])
  })

  it('never overwrites a theme already chosen', async () => {
    await payload.delete({ collection: 'ventures', where: { tenant: { equals: tenant } }, context })
    const venture = await payload.create({
      collection: 'ventures',
      context,
      data: {
        tenant,
        name: 'Phulhaar Gallery by PJK',
        slug: 'phulhaar-gallery',
        theme: 'pjk',
        _status: 'published',
      } as never,
    })
    expect(await fill()).toEqual([])
    expect(
      (await payload.findByID({ collection: 'ventures', id: venture.id, context })).theme,
    ).toBe('pjk')
  })
})
