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
  confirmArtistApplication,
  fillAboutYou,
} from '../helpers/e2e'

/*
 * Applying, as a person would, in a real browser: an artist through the five steps (stopping
 * halfway and coming back), a partner, and signing in again with a code. The identity paths move
 * with identity itself to after approval (the overhaul's Stage 6), and are tested there.
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

type Page = import('@playwright/test').Page

/** A photo of the PAN card: any picture will do in a test */
const uploadPanCard = async (page: Page) => {
  await page.locator('#field-documents-pan-card').setInputFiles({
    name: 'pan-card.jpg',
    mimeType: 'image/jpeg',
    buffer: await picture(3),
  })
  await expect(page.getByRole('img', { name: 'Preview: PAN card' })).toBeVisible()
}

/**
 * The photo of the applicant holding their code, name and date of birth: the code is given for
 * ten minutes; a browser in a test has no camera, so the photo is uploaded
 */
const uploadIdentityPhoto = async (page: Page) => {
  await page.getByRole('button', { name: 'Show my code' }).click()
  await expect(page.getByText(/^[2-9A-Z]{3}-[2-9A-Z]{3}$/)).toBeVisible()
  await expect(page.getByText(/^Valid for \d:\d\d$/)).toBeVisible()
  await page.locator('#identity-photo-file').setInputFiles({
    name: 'me-holding-the-code.jpg',
    mimeType: 'image/jpeg',
    buffer: await picture(4),
  })
  await expect(page.getByRole('img', { name: 'Preview: the photo of you' })).toBeVisible()
  // The preview shows at once; the photo has reached the server only when it says so
  await expect(
    page.locator('#field-documents-identity-photo').getByText('Received, and encrypted.'),
  ).toBeVisible()
}

/** Consent: the policy opens in a dialog, is read to the end, confirmed, and I AGREE typed */
const agreeToPrivacy = async (page: Page) => {
  await expect(page.getByRole('button', { name: 'Save and continue' })).toBeDisabled()
  // Ticking opens the policy; the box is ticked only once they have agreed
  await page.getByLabel(/I agree to PAT & J\.K\. Co\. processing/).click()
  const dialog = page.getByRole('dialog', { name: 'Privacy policy' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Agree' })).toBeDisabled()
  await dialog
    .getByRole('region', { name: 'The privacy policy' })
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await dialog.getByLabel('I have read the privacy policy to the end.').check()
  await dialog.getByLabel('Type I AGREE to confirm').fill('i agree')
  await expect(dialog.getByRole('button', { name: 'Agree' })).toBeDisabled()
  await dialog.getByLabel('Type I AGREE to confirm').fill('I AGREE')
  await dialog.getByRole('button', { name: 'Agree' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel(/I agree to PAT & J\.K\. Co\. processing/)).toBeChecked()
}

test('an artist applies step by step, stops halfway, and comes back', async ({ page, context }) => {
  const email = uniqueEmail('artist')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)

  // About you
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await fillAboutYou(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Where you live
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
  await page.getByLabel('House or flat, and street').fill('House 1, Example Lane')
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
  await expect(page.getByRole('button', { name: 'About you, done' })).toBeVisible()

  // Your practice
  // Original, hand-made work only: no photography, prints or digital work on the list
  await expect(page.getByLabel('Photography', { exact: true })).toHaveCount(0)
  await page.getByLabel('Painting', { exact: true }).check()
  await page.getByLabel('Papier-mâché').check()
  await page
    .getByLabel('Your style and subjects')
    .fill('Landscapes of the Shivalik foothills, painted outdoors in every season.')
  // Short of the minimum, the count says how far there is to go
  await expect(page.getByText(/of at least 80/)).toBeVisible()
  await page
    .getByLabel('Your style and subjects')
    .fill('Landscapes of the Shivalik foothills, painted outdoors in every season, in oils.')
  await page.getByLabel('How long have you been making work?').selectOption('6 to 10 years')
  await page
    .getByLabel('A short biography')
    .fill(
      'A painter working in oils and watercolour, mostly outdoors, across the seasons. '.repeat(4),
    )
  await page.getByLabel(/^Instagram/).fill('@asha.example')
  await page.getByRole('button', { name: 'Add another link' }).click()
  await page.getByLabel('Platform').fill('Behance')
  await page.getByLabel('Link or ID').fill('asha-example')
  await page.getByLabel('Your usual price range').selectOption('₹25,000 to ₹1 lakh')
  // The section is required, with a plain way to say there is nothing yet
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(
    page.getByText('Please add at least one, or choose “None yet”.').first(),
  ).toBeVisible()
  await page.getByLabel('None yet').check()
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
  await expect(page.getByText('3 of 10 added')).toBeVisible({ timeout: 60_000 })
  for (const [i, title] of ['Dusk', 'River', 'Hills'].entries()) {
    await page.getByLabel('Title', { exact: true }).nth(i).fill(title)
    await page
      .getByRole('listbox', { name: 'Year made' })
      .nth(i)
      .getByRole('option', { name: '2024', exact: true })
      .click()
    await page.getByLabel('Medium and surface').nth(i).fill('Oil on canvas')
    await page.getByLabel('Width', { exact: true }).nth(i).fill('60,5')
    await page.getByLabel('Height', { exact: true }).nth(i).fill('90')
  }
  // Inches for the last one: kept as given, and in centimetres
  await page.getByLabel('Unit', { exact: true }).nth(2).selectOption('in')
  // The first is for sale at a price, the others not
  await page.getByRole('radio', { name: 'Yes, at' }).first().check()
  await page.getByLabel('Price in rupees').first().fill('45000')
  await page.getByRole('radio', { name: 'No, not for sale' }).nth(1).check()
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // Review and send: no identity step any more
  await expect(page.getByRole('heading', { name: 'Review and send' })).toBeVisible()
  await expect(page.getByText('12 April 1990')).toBeVisible()
  await expect(page.getByText('6 to 10 years')).toBeVisible()
  await confirmArtistApplication(page)
  await page.getByRole('button', { name: 'Send my application' }).click()
  await expect(
    page.getByRole('heading', { name: 'Thank you. Your application has reached us.' }),
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
  expect(application.practice?.yearsPractising).toBe(6)
  expect(application.practice?.recognitionNone).toBe(true)
  expect(application.portfolio?.[0]).toMatchObject({
    year: 2024,
    width: 60.5,
    widthCm: 60.5,
    priceInr: 45000,
  })
  expect(application.portfolio?.[1]?.priceInr ?? null).toBeNull()
  expect(application.portfolio?.[2]).toMatchObject({ unit: 'in', width: 60.5, widthCm: 153.67 })
  expect(application.about?.consentProcessing).toBe(true)
  expect(application.declarations?.notCopy).toBe(true)
})

// Identity is asked for after approval now; Stage 6 of the overhaul moves this test to that page
test.fixme('PAN is required, and a masked e-Aadhaar goes through the check', async ({ page }) => {
  const email = uniqueEmail('aadhaar')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await fillEarlySteps(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Identity', exact: true })).toBeVisible()

  // Without a PAN, nothing is saved
  await agreeToPrivacy(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('A PAN is ten characters', { exact: false }).first()).toBeVisible()

  // The masked e-Aadhaar path, with a made-up signed PDF and its password
  await page.getByLabel('PAN', { exact: true }).fill('ABCPE1234F')
  await page.getByLabel('Name as on your PAN').fill('Asha Example')
  await uploadPanCard(page)
  await page
    .locator('#field-documents-masked-aadhaar')
    .setInputFiles(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../fixtures/eaadhaar/masked-signed.pdf',
      ),
    )
  // The PDF has a password: no preview until it is typed
  await expect(
    page
      .getByText(/This PDF has a password/)
      .or(page.getByRole('img', { name: /Preview of the first page: Masked e-Aadhaar/ })),
  ).toBeVisible()
  await page.getByLabel('Last four digits of your Aadhaar').fill('4821')
  await page.getByLabel('The PDF’s password').fill('ASHA1990')
  await uploadIdentityPhoto(page)
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

test('a trade partner applies in one go, with no identity documents', async ({ page }) => {
  const email = uniqueEmail('partner')
  await page.goto('/collaborate/partners')
  await expect(page.getByRole('heading', { name: 'Apply for a trade account' })).toBeVisible()
  await signInWithCode(page, email)

  // Before you begin: how the details are used, agreed to with I AGREE
  await expect(page.getByRole('heading', { name: 'How we use your details' })).toBeVisible()
  await page.getByLabel('I have read how PAT & J.K. Co. will use my details').check()
  await page.getByLabel('To confirm, type I AGREE').fill('I AGREE')

  await page.getByLabel('Your full name').fill('Asha Example')
  await page.getByLabel('Your role').fill('Art consultant')
  await page.getByLabel('Firm or organisation').fill('Example Art Advisory')
  await page.getByLabel('Phone', { exact: true }).fill('98765 43210')
  await expect(page.getByText('The address you signed in with.')).toBeVisible()

  await page.getByLabel('Which describes you best?').selectOption('Art adviser or consultant')
  await page.getByLabel('City').fill('Jammu')
  await page.getByLabel('State or union territory').selectOption('Jammu and Kashmir')
  await page.getByLabel(/^GSTIN/).fill('01ABCDE1234F1ZE')

  // Outside India the tax number and the proof ask for something else
  await page.getByLabel('Country', { exact: true }).selectOption('United Kingdom')
  await expect(page.getByLabel(/^Company registration or VAT number/)).toBeVisible()
  await expect(page.getByText(/RIBA, AIA or BIID/)).toBeVisible()
  await page.getByLabel('Country', { exact: true }).selectOption('India')
  await page.getByLabel('State or union territory').selectOption('Jammu and Kashmir')
  await page.getByLabel(/^GSTIN/).fill('01ABCDE1234F1ZE')

  await page
    .getByLabel('What would you like to do with us?')
    .fill('Find original work for the collectors I advise.')

  // Saved to finish later, then sent
  await page.getByRole('button', { name: 'Save and finish later' }).click()
  await expect(page.getByText(/^Saved\./)).toBeVisible()

  await page.getByLabel('The details I have given are true and complete.').check()
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Send my application' }).click()
  await expect(
    page.getByRole('heading', { name: 'Thank you. Your application has reached us.' }),
  ).toBeVisible()
  await expect(page.getByText(/emailed you a confirmation/)).toHaveCount(0)

  const member = await findMember(email)
  const p = await payload()
  const application = (
    await p.find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
  ).docs[0]!
  expect(application).toMatchObject({
    type: 'partner',
    stage: 'submitted',
    partnerCategory: 'placement',
    partner: { subType: 'Art adviser or consultant', country: 'India', gstin: '01ABCDE1234F1ZE' },
    partnerDeclarations: { consentProcessing: true, accurate: true },
  })
  const records = await p.count({
    collection: 'kyc-records',
    where: { member: { equals: member.id } },
    overrideAccess: true,
  })
  expect(records.totalDocs).toBe(0)
})

test('a member signs in again with a code, and a wrong code is refused', async ({ page }) => {
  const email = uniqueEmail('returning')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  // Signing in on the application page, without a page load, updates the header too
  await expect(page.getByRole('button', { name: 'Your account' }).first()).toBeVisible()
  await page.context().clearCookies()

  await page.goto('/collaborate/signin')
  // The button appears only once the address looks right (the human check is off in tests)
  await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0)
  await page.getByLabel('Email address').fill('not-an-address')
  await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0)
  await page.getByLabel('Email address').fill(email)
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible()
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
  // The header knows: Your account in place of Sign in
  await expect(page.getByRole('button', { name: 'Your account' }).first()).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toHaveCount(0)
})

test('a save that cannot reach the server says so, and the button comes back', async ({ page }) => {
  const email = uniqueEmail('offline')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await fillAboutYou(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()

  // The connection drops just as the address is saved
  await page.route('**/next/members/application/step', (route) =>
    route.abort('internetdisconnected'),
  )
  await page.getByLabel('House or flat, and street').fill('House 1, Example Lane')
  await page.getByLabel('City or town').fill('Kathua')
  await page.getByLabel('District').fill('Kathua')
  await page.getByLabel('State or union territory').selectOption('Jammu and Kashmir')
  await page.getByLabel('PIN code').fill('184101')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText(/We could not reach PJK just now/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save and continue' })).toBeEnabled()
  // What was typed is still there, and once the connection is back the save goes through
  await expect(page.getByLabel('City or town')).toHaveValue('Kathua')
  await page.unroute('**/next/members/application/step')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your practice' })).toBeVisible()
})

test('a save dropped once on the way goes through by itself', async ({ page }) => {
  const email = uniqueEmail('flaky')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()

  // The connection drops the first save only, as a flaky mobile network does
  let dropped = 0
  await page.route('**/next/members/application/step', async (route) => {
    if (dropped++ === 0) return route.abort('connectionreset')
    return route.continue()
  })
  await fillAboutYou(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
  await expect(page.getByText(/We could not reach PJK/)).toHaveCount(0)
  expect(dropped).toBe(2)
})
