import { expect, test } from '@playwright/test'

import { ensureApplication } from '../../src/members/accounts.js'
import {
  approveAs,
  cleanUp,
  payload,
  signInAs,
  signInAsStaff,
  uniqueEmail,
} from '../helpers/e2e'

/*
 * Away from the keyboard (src/components/session/afk.ts): a signed-in page nobody touches
 * asks whether to stay, and then signs the member out for good. The limit is fifteen minutes,
 * which no test can wait for, so the page is told to count in seconds instead — the same code,
 * reading window.__pjkAfkMs, which a production build ignores.
 */

test.beforeAll(cleanUp)
test.afterAll(cleanUp)

/** The limit this page should use, half of it with the dialog up */
const clock = (ms: number) => ({ __pjkAfkMs: ms })

const hurry = (forced: { __pjkAfkMs: number }) => Object.assign(window, forced)

const signedInArtist = async (
  context: Parameters<typeof signInAs>[0],
  name: string,
): Promise<void> => {
  const { member } = await ensureApplication(await payload(), {
    email: uniqueEmail(name),
    type: 'artist',
  })
  await approveAs(member.id)
  await signInAs(context, member.id)
}

test('a page nobody touches asks, waits, and then signs the member out', async ({
  page,
  context,
}) => {
  await signedInArtist(context, 'afk')
  await page.addInitScript(hurry, clock(8000))
  await page.goto('/account')

  // Nobody has touched it: the dialog asks, and saying so puts the limit off again
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Still there?')
  await expect(dialog).toContainText('sign you out in')
  await dialog.getByRole('button', { name: 'Stay signed in' }).click()
  await expect(dialog).toBeHidden()

  // Left alone a second time the countdown runs out: back to the sign-in page, told why
  await expect(dialog).toContainText('Still there?')
  await page.waitForURL(/\/collaborate\/signin\?from=idle/)
  await expect(page.getByText(/signed out after 15 minutes without activity/)).toBeVisible()

  // And the session itself has gone, not only this page: the account is shut again
  await page.goto('/account')
  await expect(page).toHaveURL(/\/collaborate\/signin/)
})

test('somebody using one tab keeps the other signed in', async ({ page, context }) => {
  await signedInArtist(context, 'afk-tabs')
  // Both tabs of this browser count in seconds
  await context.addInitScript(hurry, clock(20_000))
  await page.goto('/account')
  const second = await context.newPage()
  await second.goto('/account')
  const dialog = page.getByRole('dialog')

  // Reading in the second tab for longer than the whole limit: the first is never asked, because
  // every tab shares one clock
  for (let i = 0; i < 16; i++) {
    await second.keyboard.press('ArrowDown')
    await second.waitForTimeout(1500)
  }
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/account/)

  // Left alone, both tabs ask at once. Answering in either takes the question away in the other,
  // which a keystroke cannot do: once the dialog is up, only its buttons count
  await expect(dialog).toContainText('Still there?')
  await second.getByRole('button', { name: 'Stay signed in' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/account/)
  await second.close()
})

test('the admin panel asks too, and takes staff back to its sign-in page', async ({
  page,
  context,
}) => {
  await signInAsStaff(context)
  // Longer than the site's tests: the panel is a large app, and its own clock starts only once it
  // has loaded
  await page.addInitScript(hurry, clock(25_000))
  await page.goto('/admin')
  await expect(page.locator('span[title="Dashboard"]')).toBeVisible()

  // Nobody has touched the panel: it asks, in its own style, and then signs out
  await expect(page.getByRole('heading', { name: 'Still there?' })).toBeVisible()
  await page.waitForURL(/\/admin\/login/)
})
