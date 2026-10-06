import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import {
  CODE,
  cleanUp,
  fillEarlySteps,
  findMember,
  knowCode,
  openApplications,
  payload,
  signInWithCode,
  uniqueEmail,
} from '../helpers/e2e'

/*
 * Applying, as a person would, in a real browser: an artist through every step (stopping halfway
 * and coming back), the two identity paths, a partner, and signing in again with a code.
 */

let restore: () => Promise<void>
test.beforeAll(async () => {
  await cleanUp()
  restore = await openApplications()
})
test.afterAll(async () => {
  await cleanUp()
  await restore()
})

const picture = (i: number) =>
  sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 60 * i, g: 120, b: 90 } },
  })
    .jpeg()
    .toBuffer()

const fillKycOtherId = async (page: import('@playwright/test').Page) => {
  await page.getByLabel(/I agree to PAT and J\.K\. Co\. processing/).check()
  await page.getByLabel('PAN', { exact: true }).fill('ABCPE1234F')
  await page.getByLabel('Name as on your PAN').fill('Asha Example')
  await page.getByLabel('I’d rather use another ID').check()
  await page.getByRole('radio', { name: 'Passport', exact: true }).check()
  await page.locator('#field-documents-other-id').setInputFiles({
    name: 'passport.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
  })
  await expect(page.getByText('Received, and encrypted.')).toBeVisible()
  await page.getByLabel('Yes', { exact: true }).check()
  // No bank details: those are asked for only when a sale needs a payout
  await expect(page.getByLabel('Account number', { exact: true })).toHaveCount(0)
}

test('an artist applies step by step, stops halfway, and comes back', async ({ page, context }) => {
  const email = uniqueEmail('artist')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)

  // About you
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await page.getByLabel('Your full legal name').fill('Asha Example')
  await page.getByLabel('The name you work under').fill('Asha')
  await page.getByLabel('Date of birth').fill('1990-04-12')
  await page.getByLabel('Mobile number').fill('98765 43210')
  await page.getByLabel('Language you would like us to write in').selectOption('English')
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Where you live
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
  await page.getByLabel('Address line 1').fill('House 1, Example Lane')
  await page.getByLabel('City or town').fill('Kathua')
  await page.getByLabel('District').fill('Kathua')
  await page.getByLabel('State or union territory').selectOption('Jammu and Kashmir')
  await page.getByLabel('PIN code').fill('184101')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your practice' })).toBeVisible()

  // Stop here: a fresh browser, signing in again, picks up where they left off
  await context.clearCookies()
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'Your practice' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Step 1: About you, saved/ })).toBeVisible()

  // Your practice
  await page.getByLabel('Painting').check()
  await page.getByLabel('Styles and themes').fill('Landscapes of the foothills.')
  await page.getByLabel('Years practising').fill('6')
  await page
    .getByLabel('A short biography')
    .fill(
      'A painter working in oils and watercolour, mostly outdoors, across the seasons. '.repeat(2),
    )
  await page.getByLabel('Typical price range').selectOption({ index: 2 })
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Your work: three pictures, each described
  await expect(page.getByRole('heading', { name: 'Your work' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(
    await Promise.all(
      [1, 2, 3].map(async (i) => ({
        name: `work-${i}.jpg`,
        mimeType: 'image/jpeg',
        buffer: await picture(i),
      })),
    ),
  )
  await expect(page.getByText('3 of 10 works added.')).toBeVisible({ timeout: 60_000 })
  for (const [i, title] of ['Dusk', 'River', 'Hills'].entries()) {
    await page.getByLabel('Title', { exact: true }).nth(i).fill(title)
    await page.getByLabel('Year', { exact: true }).nth(i).fill('2024')
    await page.getByLabel('Medium', { exact: true }).nth(i).fill('Oil on canvas')
    await page.getByLabel('Width (cm)').nth(i).fill('60')
    await page.getByLabel('Height (cm)').nth(i).fill('90')
  }
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Identity: the other-ID path
  await expect(page.getByRole('heading', { name: 'Identity', exact: true })).toBeVisible()
  await fillKycOtherId(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Review and send
  await expect(page.getByRole('heading', { name: 'Review and send' })).toBeVisible()
  await expect(page.getByText('ABCxxxxx4F')).toBeVisible()
  await page.getByLabel(/my own original work/).check()
  await page.getByLabel(/information I have given is accurate/).check()
  await page.getByLabel(/processing my identity details to verify who I am, and/).check()
  await page.getByRole('button', { name: 'Send my application' }).click()
  await expect(
    page.getByRole('heading', { name: 'Thank you. We have your application.' }),
  ).toBeVisible()

  const member = await findMember(email)
  const application = (
    await (
      await payload()
    ).find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
  ).docs[0]!
  expect(application.stage).toBe('submitted')
})

test('PAN is required, and a masked e-Aadhaar goes through the check', async ({ page }) => {
  const email = uniqueEmail('aadhaar')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await fillEarlySteps(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Identity', exact: true })).toBeVisible()

  // Without a PAN, nothing is saved
  await page.getByLabel(/I agree to PAT and J\.K\. Co\. processing/).check()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('A PAN is ten characters', { exact: false }).first()).toBeVisible()

  // The masked e-Aadhaar path, with a made-up signed PDF and its password
  await page.getByLabel('PAN', { exact: true }).fill('ABCPE1234F')
  await page.getByLabel('Name as on your PAN').fill('Asha Example')
  await page
    .locator('#field-documents-masked-aadhaar')
    .setInputFiles(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../fixtures/eaadhaar/masked-signed.pdf',
      ),
    )
  await expect(page.getByText('Received, and encrypted.')).toBeVisible()
  await page.getByLabel('Last four digits of your Aadhaar').fill('4821')
  await page.getByLabel('The PDF’s password').fill('ASHA1990')
  await page.getByLabel('Yes', { exact: true }).check()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Review and send' })).toBeVisible()
  await expect(page.getByText('XXXX XXXX 4821')).toBeVisible()

  // The check ran and recorded a result for staff; the made-up chain is not India's
  const member = await findMember(email)
  await expect
    .poll(async () => {
      const record = (
        await (
          await payload()
        ).find({
          collection: 'kyc-records',
          where: { member: { equals: member.id } },
          overrideAccess: true,
        })
      ).docs[0]
      return record?.aadhaarCheck?.result
    })
    .toBe('not-verified')
})

test('a partner applies in one go', async ({ page }) => {
  const email = uniqueEmail('partner')
  await page.goto('/collaborate/partners')
  await signInWithCode(page, email)
  await page.getByLabel('How would you like to work with us?').selectOption({ index: 1 })
  await page.getByLabel('What describes you best?').selectOption({ index: 1 })
  await page.getByLabel('Your full name').fill('Ravi Example')
  await page.getByLabel('Your role').fill('Founder')
  await page.getByLabel('Organisation').fill('Example Interiors')
  await page.getByLabel('Phone').fill('98765 43210')
  await page.getByLabel('City').fill('Jammu')
  await page.getByLabel('State or union territory').selectOption('Jammu and Kashmir')
  await page
    .getByLabel('What would you like to do together?')
    .fill('Place works in the homes we design.')
  await page
    .getByLabel('Message')
    .fill('We design homes in Jammu and would like to show local artists in them.')
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: /Send/ }).click()
  await expect(page.getByText(/Thank you/).first()).toBeVisible()
  const member = await findMember(email)
  const application = (
    await (
      await payload()
    ).find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
  ).docs[0]!
  expect(application.type).toBe('partner')
  expect(application.stage).toBe('submitted')
})

test('a member signs in again with a code, and a wrong code is refused', async ({ page }) => {
  const email = uniqueEmail('returning')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await page.context().clearCookies()

  await page.goto('/collaborate/signin')
  await page.getByLabel('Email address').fill(email)
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel('Six-digit code').waitFor()
  await knowCode(email)
  await page.getByLabel('Six-digit code').fill('000000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(/not right|not accepted|expired/i).first()).toBeVisible()
  await page.getByLabel('Six-digit code').fill(CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/account/)
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible()
})
