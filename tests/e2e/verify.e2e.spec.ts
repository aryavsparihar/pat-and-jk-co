import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from '@payloadcms/db-postgres'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { VERIFY_CHECKBOX, VERIFY_ERRORS } from '../../src/kyc/verify.js'
import { ensureApplication } from '../../src/members/accounts.js'
import { execute } from '../../src/utilities/sql.js'
import { cleanUp, payload, signInAs, uniqueEmail } from '../helpers/e2e'

/*
 * Confirm who you are, after approval, as a person would in a real browser (the founder's Verify
 * design): the notice agreed to, the PAN and its card, a second ID, and the photo with its ten-
 * minute code, then sent for the team to check. A browser in a test has no camera, so photos are
 * uploaded. The masked e-Aadhaar path runs the real check, with a made-up signed PDF.
 */

test.beforeAll(cleanUp)
test.afterAll(cleanUp)

type Page = import('@playwright/test').Page

const picture = (i: number) =>
  sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 60 * i, g: 120, b: 90 } },
  })
    .jpeg()
    .toBuffer()

/** An artist in India whose application we have approved, signed in on this page */
const approvedArtist = async (context: import('@playwright/test').BrowserContext) => {
  const p = await payload()
  const { member, application } = await ensureApplication(p, {
    email: uniqueEmail('verify'),
    type: 'artist',
  })
  await p.update({
    collection: 'applications',
    id: application.id,
    data: {
      about: { legalName: 'Asha Example', dateOfBirth: '1990-04-12' },
      address: { residence: { line1: '7 Example Lane', city: 'Kathua', country: 'India' } },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await execute(p, sql`UPDATE applications SET stage = 'approved' WHERE id = ${application.id}`)
  await signInAs(context, member.id)
  return { member, application }
}

const agree = async (page: Page) => {
  await page.getByLabel(VERIFY_CHECKBOX).check()
  await page.getByLabel('To confirm, type I AGREE').fill('I AGREE')
}

const panDetails = async (page: Page) => {
  await page.getByLabel('PAN', { exact: true }).fill('ABCPE1234F')
  await page.getByLabel('Name as printed on your PAN').fill('Asha Example')
  await page.locator('#field-documents-pan-card').setInputFiles({
    name: 'pan-card.jpg',
    mimeType: 'image/jpeg',
    buffer: await picture(3),
  })
  await expect(page.getByRole('img', { name: 'Preview: A photo of your PAN card' })).toBeVisible()
}

/** The photo of the artist holding their code, name and date of birth */
const photo = async (page: Page) => {
  await page.getByRole('button', { name: 'Show me my code' }).click()
  await expect(page.getByText(/^[2-9A-Z]{3}-[2-9A-Z]{3}$/)).toBeVisible()
  await page.locator('#identity-photo-file').setInputFiles({
    name: 'me-holding-the-code.jpg',
    mimeType: 'image/jpeg',
    buffer: await picture(4),
  })
  await expect(page.getByRole('img', { name: 'Preview: the photo of you' })).toBeVisible()
}

test('an approved artist confirms who they are with a PAN and a second ID', async ({
  page,
  context,
}) => {
  const { application } = await approvedArtist(context)
  await page.goto('/account')
  await expect(page.getByText('Approved. Please confirm who you are')).toBeVisible()
  await page.getByRole('link', { name: 'Confirm who you are' }).click()
  await expect(page).toHaveURL(/\/account\/verify$/)
  await expect(page.getByText(application.reference, { exact: false }).first()).toBeVisible()

  // Nothing is sent without the PAN, the documents, the photo and the consent
  await page.getByRole('button', { name: 'Send for checking' }).click()
  await expect(page.getByText(VERIFY_ERRORS.pan).first()).toBeVisible()
  await expect(page.getByText(VERIFY_ERRORS.consent).first()).toBeVisible()

  await agree(page)
  await panDetails(page)
  await page.getByLabel('Passport, voter ID or driving licence').check()
  await page.locator('#field-documents-other-id').setInputFiles({
    name: 'voter-id.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n% a made-up voter ID\n%%EOF\n'),
  })
  await page.getByLabel('Yes', { exact: true }).check()
  await photo(page)
  await expect(page.getByText('Received, and encrypted.')).toHaveCount(3)

  await page.getByRole('button', { name: 'Send for checking' }).click()
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()
  await page.getByRole('link', { name: 'Go to your account' }).click()
  await expect(page.getByText('We are checking your details')).toBeVisible()
  // Sent once: the page now only says where it has got to
  await page.goto('/account/verify')
  await expect(page.getByRole('button', { name: 'Send for checking' })).toHaveCount(0)
})

test('a masked e-Aadhaar goes through the check', async ({ page, context }) => {
  const { member } = await approvedArtist(context)
  await page.goto('/account/verify')
  await agree(page)
  await panDetails(page)
  await page.getByLabel('Masked e-Aadhaar').check()
  await page
    .locator('#field-documents-masked-aadhaar')
    .setInputFiles(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../fixtures/eaadhaar/masked-signed.pdf',
      ),
    )
  await page.getByLabel('Last four digits').fill('4821')
  await page.getByLabel('The PDF’s password').fill('ASHA1990')
  await page.getByLabel('Yes', { exact: true }).check()
  await photo(page)
  await page.getByRole('button', { name: 'Send for checking' }).click()
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()

  // The check ran and recorded a result for staff; the made-up chain is not India's
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
