import { createHash } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { expect, test } from '@playwright/test'

import { saveKyc, storeKycDocument } from '../../src/kyc/service.js'
import { ensureApplication } from '../../src/members/accounts.js'
import { execute } from '../../src/utilities/sql.js'
import {
  approveAs,
  cleanUp,
  knowCode,
  payload,
  signInAs,
  signInAsStaff,
  uniqueEmail,
} from '../helpers/e2e'

/*
 * The member portal in a real browser: an approved artist adds a work, a pending one cannot,
 * payout details are asked for by staff, added by the artist and stopped from the email's link,
 * and staff and member sessions share a browser without getting in each other's way.
 */

test.beforeAll(cleanUp)
test.afterAll(cleanUp)

const artist = async (approved = true) => {
  const email = uniqueEmail(approved ? 'portal' : 'pending')
  const { member, application } = await ensureApplication(await payload(), {
    email,
    type: 'artist',
  })
  if (approved) await approveAs(member.id)
  return { email, member, application }
}

test('an approved artist gives their Drive folder and describes a work, which waits for review', async ({
  page,
  context,
}) => {
  const { member } = await artist()
  await signInAs(context, member.id)
  await page.goto('/account/works')

  // The folder: a file link is refused with a reason, a folder link is kept in its plain form
  const folder = page.getByLabel(/Your Google Drive folder/)
  await folder.fill('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view')
  await page.getByRole('button', { name: 'Save the link' }).click()
  await expect(page.getByText(/Please paste the link to a Google Drive folder/)).toBeVisible()
  await folder.fill('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing')
  await page.getByRole('button', { name: 'Save the link' }).click()
  await expect(page.getByText(/Saved\. Our team has been told/)).toBeVisible()
  await expect(folder).toHaveValue('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp')
  await expect(page.getByRole('heading', { name: 'How to set out your folder' })).toBeVisible()

  // A work: its name says how to name its folder and files, and it needs a description
  await page.getByRole('link', { name: 'Describe a work' }).click()
  await page.getByLabel('Name of the work', { exact: true }).fill('River at Dusk')
  await expect(page.getByText('River at Dusk - 1.jpg')).toBeVisible()
  await page.getByLabel(/^Year/).fill('2024')
  await page.getByLabel(/^Medium/).fill('Oil')
  await page.getByLabel(/^Surface/).fill('Canvas')
  await page.getByLabel(/^Width/).fill('60')
  await page.getByLabel(/^Height/).fill('90')
  await page.getByLabel('Price (₹)').fill('45000')
  await page.getByRole('button', { name: 'Save and send for review' }).click()
  await expect(
    page.getByText(/Please describe the work, in at least 80 characters/).first(),
  ).toBeVisible()
  await page
    .getByLabel('Description', { exact: true })
    .fill(
      'The river below the town at dusk, painted outdoors over three evenings in early winter, in oil on a primed canvas.',
    )
  await page.getByRole('button', { name: 'Save and send for review' }).click()
  await expect(page).toHaveURL(/\/account\/works\?saved=1/)
  await expect(page.getByRole('link', { name: 'Edit River at Dusk' })).toBeVisible()
  await expect(page.getByText('Waiting for our review').first()).toBeVisible()
})

test('a pending artist has no portfolio', async ({ page, context }) => {
  const { member } = await artist(false)
  await signInAs(context, member.id)
  await page.goto('/account/works')
  await expect(page).toHaveURL(/\/account$/)
  const api = await page.request.get('/next/members/portal/artworks')
  expect(api.status()).toBe(403)
})

test('payout details: staff ask, the artist adds them, and “this was not me” stops them', async ({
  page,
  context,
  browser,
}) => {
  const p = await payload()
  const { email, member, application } = await artist()
  const fresh = await p.findByID({ collection: 'members', id: member.id, overrideAccess: true })
  const passport = await storeKycDocument(p, {
    member: fresh,
    kind: 'other-id',
    bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
  })
  // The application's identity details: no bank details there any more
  const record = await saveKyc(p, {
    member: fresh,
    reference: application.reference,
    consent: { noticeVersion: 'test', confirmation: 'test' },
    input: {
      consent: true,
      pan: 'ABCPE1234F',
      panName: 'Asha Example',
      idChoice: 'other',
      otherIdKind: 'passport',
      addressOnIdMatches: true,
      documents: { 'other-id': passport.id },
    } as never,
  })

  // A work sells: a reviewer asks for payout details from the KYC record
  const staff = await browser.newContext()
  await signInAsStaff(staff)
  const admin = await staff.newPage()
  await admin.goto(`/admin/collections/kyc-records/${record.id}`)
  await admin.getByRole('button', { name: 'Request payout details' }).click()
  await admin.getByRole('dialog').getByRole('button', { name: 'Send the request' }).click()
  await expect(admin.getByText(/Sent\. The artist has been asked/)).toBeVisible()
  await staff.close()

  // The artist adds them in their account, with a fresh code
  await signInAs(context, member.id)
  await page.goto('/account/payouts')
  await expect(page.getByText('We are ready to pay you.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Add where we pay you' }).click()
  await page.getByLabel('Code from the email').fill(await knowCode(email, 'step-up'))
  await page.getByLabel('Account holder’s name').fill('Asha Example')
  await page.getByLabel('Account number', { exact: true }).fill('999900004821')
  await page.getByLabel('Account number again').pressSequentially('999900004821')
  await page.getByLabel('IFSC').fill('TEST0000001')
  await page.getByLabel('Bank', { exact: true }).fill('Example Bank')
  await page.getByLabel('Branch').fill('Example Branch')
  await page.getByRole('button', { name: 'Send the details' }).click()
  await expect(page.getByText(/sending ₹1 to it first/)).toBeVisible()

  // The email carries a one-time link; the test knows its token by setting it
  const token = 'e2e-made-up-cancel-token-0000000000000000000000'
  await execute(
    p,
    sql`UPDATE kyc_records SET pending_bank_cancel_token_hash = ${createHash('sha256').update(token).digest('hex')} WHERE member_id = ${member.id}`,
  )
  await page.goto(`/account/bank-change/cancel?t=${token}`)
  await page.getByRole('button', { name: 'Stop the change' }).click()
  await expect(page.getByText('The change has been stopped.')).toBeVisible()

  await page.goto('/account')
  await expect(page).toHaveURL(/\/collaborate\/signin/)
  const after = await p.findByID({ collection: 'kyc-records', id: record.id, overrideAccess: true })
  expect(after.pendingBank?.requestedAt ?? null).toBeNull()
  expect(after.accountMasked ?? null).toBeNull()
})

test('a staff session and a member session share a browser', async ({ page, context }) => {
  const { email, member } = await artist()
  await signInAs(context, member.id)
  await signInAsStaff(context)

  // The admin sees the member of staff
  await page.goto('/admin')
  await expect(page.locator('span[title="Dashboard"]').first()).toBeVisible()
  // The member's own pages still see the member
  await page.goto('/account')
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible()
})
