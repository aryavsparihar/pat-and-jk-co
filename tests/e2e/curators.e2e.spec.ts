import { expect, test } from '@playwright/test'

import { payload, uniqueEmail } from '../helpers/e2e'

/*
 * The guest curator form in a browser (the founder's ApplyCurator design): no account, the files
 * sent in parts after the answers, and the thank-you with the CA- number. Every address is made up
 * at @e2e.example.test, and the application is removed afterwards.
 */

const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4096, 32)])

test.afterAll(async () => {
  const p = await payload()
  await p.delete({
    collection: 'applications',
    where: { 'curator.email': { like: '@e2e.example.test' } },
    overrideAccess: true,
  })
})

test('a guest curator applies without an account', async ({ page }) => {
  const email = uniqueEmail('curator')
  await page.goto('/collaborate/curators')
  await expect(page.getByRole('heading', { name: 'Curate with us' })).toBeVisible()

  // Sent empty: every problem at once, in the founder's words
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Send my application' }).click()
  await expect(page.getByText('Please confirm that you are 18 or over.').first()).toBeVisible()
  await expect(page.getByText('Please add your CV.').first()).toBeVisible()

  await page.getByLabel('I have read how PAT & J.K. Co. will use my details').check()
  await page.getByLabel('Your full name').fill('Rohan Example')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Phone', { exact: true }).fill('98765 43210')
  await page.getByLabel('City').fill('Delhi')
  await page.getByLabel('I am 18 or over.').check()

  await page.getByLabel('Your current role').fill('Independent curator')
  await page.getByLabel('Years curating').selectOption('6-10')
  await page.getByLabel('Contemporary art').check()

  await page.getByLabel('Portfolio link').fill('https://example.com/rohan')
  // A CV of the wrong kind is refused as soon as it is chosen
  await page.getByLabel('Your CV').setInputFiles({
    name: 'cv.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('plain text'),
  })
  await expect(page.getByText('Your CV needs to be a PDF or Word file.').first()).toBeVisible()
  await page.getByLabel('Your CV').setInputFiles({
    name: 'cv.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  })
  await expect(page.getByText('cv.pdf')).toBeVisible()

  for (const [i, title] of ['Paper and Thread', 'Rooms of Light'].entries()) {
    const project = page.locator('fieldset', { hasText: 'Two or three past projects' })
    await project.getByLabel('Title').nth(i).fill(title)
    await project
      .getByLabel('Year')
      .nth(i)
      .fill(String(2024 - i))
    await project.getByLabel('Where, or for whom').nth(i).fill('A gallery in Delhi')
    await project.getByLabel('Your role').nth(i).fill('Lead curator')
  }
  await page.getByLabel('Both').check()
  await page.getByLabel(/My portfolio and projects are described accurately/).check()

  await page.getByRole('button', { name: 'Send my application' }).click()
  await expect(
    page.getByRole('heading', { name: 'Thank you. Your application has reached us.' }),
  ).toBeVisible()
  await expect(page.getByText(/CA-[2-9A-Z]{5}/)).toBeVisible()
  await expect(page.getByText(/emailed you a confirmation/)).toHaveCount(0)

  const p = await payload()
  const found = await p.find({
    collection: 'applications',
    where: { 'curator.email': { equals: email } },
    overrideAccess: true,
  })
  expect(found.docs[0]).toMatchObject({ type: 'curator', stage: 'submitted', curatorStatus: 'new' })
  expect(found.docs[0]!.curatorFiles?.map((f) => f.kind)).toEqual(['cv'])
})
