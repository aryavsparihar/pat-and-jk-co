import { expect, test } from '@playwright/test'

import { ensureApplication } from '../../src/members/accounts.js'
import { cleanUp, payload, signInAsStaff, uniqueEmail } from '../helpers/e2e'

/*
 * A member of staff approves an artist's application in the admin, which issues the member ID.
 */

test.beforeAll(cleanUp)
test.afterAll(cleanUp)

test('approving an application asks the artist to confirm who they are, with no ID yet', async ({
  page,
  context,
}) => {
  const p = await payload()
  const { member, application } = await ensureApplication(p, {
    email: uniqueEmail('approved'),
    type: 'artist',
  })
  await p.update({
    collection: 'applications',
    id: application.id,
    data: { stage: 'submitted' },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

  await signInAsStaff(context)
  await page.goto(`/admin/collections/applications/${application.id}`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText(/they confirm who they are next/)).toBeVisible()

  // The member ID is issued when the agreement is signed, not on approval
  const after = await p.findByID({ collection: 'members', id: member.id, overrideAccess: true })
  expect(after.artistId ?? null).toBeNull()
  expect(after.artistApprovedAt).toBeTruthy()
  const decided = await p.findByID({
    collection: 'applications',
    id: application.id,
    overrideAccess: true,
  })
  expect(decided.stage).toBe('approved')
})
