import { createHash } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'

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
 * The member portal in a real browser: an approved artist adds a work, a pending one cannot, a
 * change of bank details is stopped from the email's link, and staff and member sessions share a
 * browser without getting in each other's way.
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

test('an approved artist adds a work, which waits for review', async ({ page, context }) => {
  const { member } = await artist()
  await signInAs(context, member.id)
  await page.goto('/account/works/new')
  await page.getByLabel('Title', { exact: true }).fill('River at dusk')
  await page.getByLabel(/^Year/).fill('2024')
  await page.getByLabel(/^Medium/).fill('Oil')
  await page.getByLabel(/^Surface/).fill('Canvas')
  await page.getByLabel(/^Width/).fill('60')
  await page.getByLabel(/^Height/).fill('90')
  await page.getByLabel('Price (₹)').fill('45000')
  await page.locator('#work-pictures').setInputFiles({
    name: 'river.jpg',
    mimeType: 'image/jpeg',
    buffer: await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 40, g: 90, b: 130 } },
    })
      .jpeg()
      .toBuffer(),
  })
  await expect(page.getByRole('img', { name: 'Picture 1' })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Save and send for review' }).click()
  await expect(page).toHaveURL(/\/account\/works\?saved=1/)
  await expect(page.getByRole('link', { name: 'Edit River at dusk' })).toBeVisible()
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

test('a bank change waits, and “this was not me” stops it and signs out', async ({
  page,
  context,
}) => {
  const p = await payload()
  const { email, member, application } = await artist()
  const fresh = await p.findByID({ collection: 'members', id: member.id, overrideAccess: true })
  const passport = await storeKycDocument(p, {
    member: fresh,
    kind: 'other-id',
    bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
  })
  await saveKyc(p, {
    member: fresh,
    reference: application.reference,
    legalName: 'Asha Example',
    input: {
      consent: true,
      pan: 'ABCPE1234F',
      panName: 'Asha Example',
      idChoice: 'other',
      otherIdKind: 'passport',
      addressOnIdMatches: true,
      bank: {
        holderName: 'Asha Example',
        accountNumber: '999900004821',
        accountNumberConfirm: '999900004821',
        ifsc: 'TEST0000001',
        bankName: 'Example Bank',
        branchName: 'Example Branch',
        accountType: 'savings',
      },
      documents: { 'other-id': passport.id },
    } as never,
  })

  await signInAs(context, member.id)
  await page.goto('/account/payouts')
  await expect(page.getByText('XXXXXXXX4821')).toBeVisible()
  await page.getByRole('button', { name: 'Change where we pay you' }).click()
  await page.getByLabel('Code from the email').fill(await knowCode(email, 'step-up'))
  await page.getByLabel('Account holder’s name').fill('Asha Example')
  await page.getByLabel('Account number', { exact: true }).fill('888800007733')
  await page.getByLabel('Account number again').pressSequentially('888800007733')
  await page.getByLabel('IFSC').fill('TEST0000002')
  await page.getByLabel('Bank', { exact: true }).fill('Other Example Bank')
  await page.getByLabel('Branch').fill('Main Branch')
  await page.getByRole('button', { name: 'Send the new details' }).click()
  await expect(page.getByText(/keep paying into your current account/)).toBeVisible()

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
  const record = (
    await p.find({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
  ).docs[0]!
  expect(record.pendingBank?.requestedAt ?? null).toBeNull()
  expect(record.accountMasked).toBe('XXXXXXXX4821')
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
