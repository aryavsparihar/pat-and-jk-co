import { sql } from '@payloadcms/db-postgres'
import { type Page, expect, test } from '@playwright/test'

import {
  BASE,
  approveAs,
  cleanUp,
  fillEarlySteps,
  findMember,
  knowCode,
  openApplications,
  payload,
  signInAs,
  signInWithCode,
  uniqueEmail,
} from '../helpers/e2e'
import { execute } from '../../src/utilities/sql.js'

/*
 * The unhappy paths, in a real browser: wrong and malformed input, a slow connection, a double
 * click, the back button, a session that runs out mid-form, an upload that fails or is
 * cancelled, and pages with nothing to show. Losing the connection mid-step and coming back is
 * covered in applications.e2e.spec.ts; services failing behind the scenes in
 * tests/int/outside-failures.int.spec.ts.
 */

let restore: () => Promise<void>
test.beforeAll(async () => {
  await cleanUp()
  restore = await openApplications()
})
test.afterAll(async () => {
  await cleanUp()
  await restore()
  const p = await payload()
  await p.delete({
    collection: 'tenants',
    where: { slug: { equals: 'e2e-empty' } },
    overrideAccess: true,
  })
})

const aboutYou = async (page: Page, overrides: Record<string, string> = {}) => {
  const values = {
    'Your full legal name': 'Asha Example',
    'The name you work under': 'Asha',
    'Date of birth': '1990-04-12',
    'Mobile number': '98765 43210',
    ...overrides,
  }
  for (const [label, value] of Object.entries(values)) await page.getByLabel(label).fill(value)
  await page.getByLabel('The language you would like us to write in').selectOption('English')
}

const startApplication = async (page: Page) => {
  const email = uniqueEmail('unhappy')
  await page.goto('/collaborate/artists')
  await signInWithCode(page, email)
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  return email
}

test('wrong and malformed input is refused with a reason, on every form', async ({ page }) => {
  // The contact form: nothing filled in, then a broken address
  await page.goto('/contact')
  await page.getByRole('button', { name: /^Send/ }).click()
  await expect(page.getByText(/required|Please/i).first()).toBeVisible()
  await page.getByLabel('Email').fill('not-an-address')
  await page.getByRole('button', { name: /^Send/ }).click()
  await expect(page.getByText('Please enter a valid email address')).toBeVisible()

  // The staff gate: a non-company address
  await page.goto('/admin-access')
  const gateEmail = page.getByLabel(/email/i).first()
  await gateEmail.fill('someone@gmail.com')
  await page.getByRole('button', { name: /code/i }).first().click()
  await expect(page.getByText(/pjk\.co\.in/).first()).toBeVisible()

  // The application: an under-age birth date and a broken phone number, then a wrong PIN code
  await startApplication(page)
  const tooYoung = new Date()
  tooYoung.setFullYear(tooYoung.getFullYear() - 16)
  await aboutYou(page, {
    'Date of birth': tooYoung.toISOString().slice(0, 10),
    'Mobile number': '12',
  })
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('A few things need another look')).toBeVisible()
  await expect(page.getByText(/18 or over/).first()).toBeVisible()
  await expect(page.getByText(/does not look complete/).first()).toBeVisible()
  // Names in any script, with apostrophes and hyphens, are fine
  await aboutYou(page, { 'Your full legal name': "आशा D'Souza-Rao عاشہ" })
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
  await page.getByLabel('Address line 1').fill('House 1, Example Lane')
  await page.getByLabel('City or town').fill('Kathua')
  await page.getByLabel('District').fill('Kathua')
  await page.getByLabel('State or union territory').selectOption('Jammu and Kashmir')
  await page.getByLabel('PIN code').fill('18410')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText(/six digits/).first()).toBeVisible()

  // The partner form: a GSTIN that is not one
  await page.goto('/collaborate/partners')
  await expect(page.getByLabel('How would you like to work with us?')).toBeVisible()
  await page.getByLabel('How would you like to work with us?').selectOption({ index: 1 })
  await page.getByLabel('What describes you best?').selectOption({ index: 1 })
  await page.getByLabel('Your full name').fill('Ravi Example')
  await page.getByLabel('Your role').fill('Founder')
  await page.getByLabel('Phone').fill('98765 43210')
  await page.getByLabel('City').fill('Jammu')
  await page.getByLabel('State or union territory').selectOption('Jammu and Kashmir')
  await page.getByLabel(/GSTIN/).fill('27AAPFU0939F1ZW')
  await page.getByLabel('What would you like to do together?').fill('Place works in homes.')
  await page.getByLabel('Message').fill('We design homes in Jammu.')
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: /Send/ }).click()
  await expect(page.getByText(/GSTIN does not look right/).first()).toBeVisible()
})

test('a slow connection still saves, and says it is saving meanwhile', async ({ page }) => {
  await startApplication(page)
  const cdp = await page.context().newCDPSession(page)
  // Roughly a weak 3G connection: 400 kbit/s each way, 800 ms of latency
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 800,
    downloadThroughput: 50_000,
    uploadThroughput: 50_000,
  })
  await aboutYou(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('button', { name: /Saving/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible({
    timeout: 30_000,
  })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
})

test('a double click saves once, and sends an application once', async ({ page }) => {
  const email = await startApplication(page)
  let saves = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/next/members/application/step') && r.method() === 'POST') saves++
  })
  await aboutYou(page)
  await page.getByRole('button', { name: 'Save and continue' }).dblclick()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
  expect(saves).toBe(1)

  // The rest, straight through the endpoints, then a double click on Send
  await fillEarlySteps(page)
  const member = await findMember(email)
  const p = await payload()
  const { identityPhotos, goodKyc } = await import('../helpers/kyc')
  const { saveKyc, storeKycDocument } = await import('../../src/kyc/service.js')
  const passport = await storeKycDocument(p, {
    member,
    kind: 'other-id',
    bytes: Buffer.from('%PDF-1.7\n% made up\n%%EOF\n'),
  })
  const application = (
    await p.find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
  ).docs[0]!
  await saveKyc(p, {
    member,
    reference: application.reference,
    consent: { noticeVersion: 'test', confirmation: 'test' },
    input: goodKyc({
      'other-id': passport.id,
      ...(await identityPhotos(p, member, { dateOfBirth: '1990-04-12' })),
    }) as never,
  })
  await p.update({
    collection: 'applications',
    id: application.id,
    data: { completedSteps: ['about', 'address', 'practice', 'portfolio', 'kyc'] },
    overrideAccess: true,
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Review and send' })).toBeVisible()
  await page.getByLabel(/my own original work/).check()
  await page.getByLabel(/information I have given is accurate/).check()
  await page.getByLabel(/processing my identity details/).check()
  await page.getByRole('button', { name: 'Send my application' }).dblclick()
  await expect(
    page.getByRole('heading', { name: 'Thank you. We have your application.' }),
  ).toBeVisible()
  const sent = await p.count({
    collection: 'security-events',
    where: {
      and: [
        { event: { equals: 'application-submitted' } },
        { subject: { equals: application.reference } },
      ],
    },
    overrideAccess: true,
  })
  expect(sent.totalDocs).toBe(1)
})

test('the back button mid-application loses nothing', async ({ page }) => {
  await startApplication(page)
  await aboutYou(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
  await page.getByLabel('Address line 1').fill('House 1, Example Lane')
  // Back to wherever they came from, then forward again: the saved step is still saved
  await page.goBack()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
  await page.getByRole('button', { name: /Step 1: About you, saved/ }).click()
  await expect(page.getByLabel('The name you work under')).toHaveValue('Asha')
})

test('a session that runs out mid-form lets them sign in again without losing what they typed', async ({
  page,
}) => {
  const email = await startApplication(page)
  await aboutYou(page)
  // The session ends while they are typing
  const p = await payload()
  const member = await findMember(email)
  await execute(
    p,
    sql`UPDATE member_sessions SET expires_at = now() - interval '1 second' WHERE member_id = ${member.id}`,
  )
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText(/You have been signed out/)).toBeVisible()
  await expect(page.getByLabel('Your full legal name')).toHaveValue('Asha Example')
  // Signing in again, in place
  await page.getByLabel('Email address').fill(email)
  await page.waitForTimeout(2200)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await page.getByLabel('Six-digit code').fill(await knowCode(email, 'signin'))
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText(/You have been signed out/)).toHaveCount(0)
  await expect(page.getByLabel('Your full legal name')).toHaveValue('Asha Example')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
})

test('an upload that fails says so and adds nothing; a cancelled one changes nothing', async ({
  page,
}) => {
  await startApplication(page)
  await fillEarlySteps(page)
  await page.reload()
  await page.getByRole('button', { name: /Step 4: Your work/ }).click()
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeVisible()
  const before = await page.getByText(/of 10 works added/).textContent()
  // Cancelled: the chooser closes with nothing chosen
  await page.locator('input[type="file"]').setInputFiles([])
  await expect(page.getByText(before!)).toBeVisible()
  // Failed: the connection drops as the picture is sent
  await page.route('**/next/members/portfolio', (route) =>
    route.request().method() === 'POST' ? route.abort('connectionreset') : route.continue(),
  )
  await page.locator('input[type="file"]').setInputFiles({
    name: 'lost.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      'base64',
    ),
  })
  await expect(page.getByText(/lost\.jpg: /)).toBeVisible()
  await expect(page.getByText('Not added')).toBeVisible()
  await expect(page.getByText(before!)).toBeVisible()
})

test('pages with nothing to show say so, and never break', async ({ page, context }) => {
  // A brand with no ventures, no journal posts and no settings at all
  const p = await payload()
  await p.delete({
    collection: 'tenants',
    where: { slug: { equals: 'e2e-empty' } },
    overrideAccess: true,
  })
  await p.create({
    collection: 'tenants',
    data: {
      name: 'Empty test brand',
      slug: 'e2e-empty',
      domains: [{ domain: 'e2e-empty.localhost' }],
    },
    overrideAccess: true,
  })
  for (const path of ['/', '/ventures', '/journal', '/collaborate', '/about']) {
    const response = await page.goto(`http://e2e-empty.localhost:${new URL(BASE).port}${path}`)
    expect(response?.status(), path).toBeLessThan(500)
    await expect(page.getByText(/This page could not be shown/), path).toHaveCount(0)
  }

  // An approved artist who has not given their works folder yet
  const email = uniqueEmail('no-works')
  const member = await p.create({
    collection: 'members',
    data: { email } as never,
    overrideAccess: true,
  })
  await approveAs(member.id)
  await signInAs(context, member.id)
  await page.goto('/account/works')
  await expect(page.getByLabel('Your Google Drive folder')).toBeVisible()
  await expect(page.getByText(/This page could not be shown/)).toHaveCount(0)
  // And no application of any kind
  await page.goto('/account')
  await expect(page.getByRole('heading').first()).toBeVisible()
  await expect(page.getByText(/This page could not be shown/)).toHaveCount(0)
})
