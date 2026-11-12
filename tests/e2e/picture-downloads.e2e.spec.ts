import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { ensureApplication } from '../../src/members/accounts.js'
import { ingestPortfolioImage } from '../../src/members/portfolio.js'
import { approveAs, cleanUp, payload, signInAsStaff, uniqueEmail } from '../helpers/e2e'

/*
 * Every picture can be downloaded from the admin: each work of an application, all of them at
 * once, and a member's portrait. Everyone here is made up.
 */

test.beforeAll(cleanUp)
test.afterAll(cleanUp)

const picture = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 90, g: 60, b: 30 } } })
    .jpeg()
    .toBuffer()

test('staff download a work, all the works, and a portrait', async ({ page, context }) => {
  test.setTimeout(180_000)
  const p = await payload()
  const { member, application } = await ensureApplication(p, {
    email: uniqueEmail('downloads'),
    type: 'artist',
  })
  const first = await ingestPortfolioImage(p, member, await picture())
  const second = await ingestPortfolioImage(p, member, await picture())
  await p.update({
    collection: 'applications',
    id: application.id,
    data: {
      portfolio: [
        { image: first.id, title: 'River at dusk' },
        { image: second.id, title: 'Field' },
      ],
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await approveAs(member.id)
  await p.update({
    collection: 'members',
    id: member.id,
    data: { profile: { portrait: first.id } } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await signInAsStaff(context)

  await page.goto(`/admin/collections/applications/${application.id}`)
  const one = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download this picture' }).first().click()
  const work = await one
  expect(work.suggestedFilename()).toBe(`${application.reference}-work-1-River-at-dusk.jpg`)
  expect((await work.createReadStream()).readable).toBe(true)

  const downloads: string[] = []
  page.on('download', (d) => downloads.push(d.suggestedFilename()))
  await page.getByRole('button', { name: 'Download all 2 pictures' }).click()
  await expect.poll(() => downloads.length).toBe(2)
  expect(downloads).toEqual([
    `${application.reference}-work-1.jpg`,
    `${application.reference}-work-2.jpg`,
  ])

  await page.goto(`/admin/collections/members/${member.id}`)
  const portrait = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download the portrait' }).click()
  expect((await portrait).suggestedFilename()).toMatch(/^AT\d+-portrait\.jpg$/)
})
