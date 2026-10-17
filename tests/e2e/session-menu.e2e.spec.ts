import { expect, type BrowserContext, type Page, test } from '@playwright/test'

import { ensureApplication } from '../../src/members/accounts.js'
import {
  approveAs,
  cleanUp,
  memberCookie,
  payload,
  signInAs,
  signInAsStaff,
  signInWithCode,
  uniqueEmail,
} from '../helpers/e2e'

/*
 * The Sign in / Sign out control in the header, on every path that signs someone in or out
 * (src/components/session/sessionStore.ts). Public pages are cached and say Sign in to everyone;
 * the browser alone shows who is signed in, and must never be left showing the wrong one: after
 * signing in or out here or in another tab, after Back, after a session runs out, for members and
 * for staff. Everyone here is made up.
 */

test.beforeAll(cleanUp)
test.afterAll(cleanUp)

const header = (page: Page) => page.locator('header')

const showsSignedOut = async (page: Page) => {
  await expect(header(page).getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(header(page).getByRole('button', { name: 'Sign out' })).toHaveCount(0)
}

const showsSignedIn = async (page: Page, as: 'member' | 'staff') => {
  await expect(header(page).getByRole('button', { name: 'Sign out' })).toBeVisible()
  // On a phone the bar has room for Sign out only; the account or admin link is there from a
  // tablet up, so it is looked for in the page rather than on screen
  await expect(
    header(page).getByRole('link', {
      name: as === 'staff' ? 'Admin' : 'Account',
      includeHidden: true,
    }),
  ).not.toHaveCount(0)
  await expect(header(page).getByRole('link', { name: 'Sign in' })).toHaveCount(0)
}

const approvedArtist = async () => {
  const email = uniqueEmail('menu')
  const { member } = await ensureApplication(await payload(), { email, type: 'artist' })
  await approveAs(member.id)
  return { email, member }
}

const hintOf = async (context: BrowserContext) =>
  (await context.cookies()).find((c) => c.name === 'pjk_signed_in')?.value ?? null

test('a visitor sees Sign in, and after the first page no session check is made at all', async ({
  page,
}) => {
  // A browser that has never been asked asks once, on its first page, then knows
  const first = page.waitForResponse((r) => new URL(r.url()).pathname === '/next/session')
  await page.goto('/')
  await first
  await showsSignedOut(page)
  const asked: string[] = []
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname
    if (path === '/next/session' || path === '/api/users/me') asked.push(path)
  })
  await page.goto('/about')
  await showsSignedOut(page)
  await page.goto('/ventures')
  await showsSignedOut(page)
  expect(asked).toEqual([])
})

test('signing in shows the account at once, in this tab and every other open tab', async ({
  context,
}) => {
  const { email } = await approvedArtist()
  const other = await context.newPage()
  await other.goto('/about')
  await showsSignedOut(other)

  const page = await context.newPage()
  await page.goto('/collaborate/signin')
  await signInWithCode(page, email)
  await page.waitForURL(/\/account/)
  await showsSignedIn(page, 'member')
  // The other tab, without a reload
  await showsSignedIn(other, 'member')
  expect(await hintOf(context)).toBe('member')
})

test('signing out shows Sign in everywhere, and Back never brings Sign out back', async ({
  context,
}) => {
  const { member } = await approvedArtist()
  await signInAs(context, member.id)
  const page = await context.newPage()
  const other = await context.newPage()
  await other.goto('/journal')
  await showsSignedIn(other, 'member')

  await page.goto('/')
  await showsSignedIn(page, 'member')
  await page.goto('/about')
  await showsSignedIn(page, 'member')
  await header(page).getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  await showsSignedOut(page)
  await showsSignedOut(other)
  expect(await hintOf(context)).toBeNull()

  // Back to the page left while signed in, from the browser's back/forward cache or not
  await page.goBack()
  await expect(page).toHaveURL(/\/about$/)
  await showsSignedOut(page)
})

test('a session that has run out shows Sign in, and the stale hint is cleared', async ({
  context,
  baseURL,
}) => {
  const { member } = await approvedArtist()
  const cookie = await memberCookie(member.id, { expired: true })
  const [name, value] = cookie.split('=')
  await context.addCookies([
    { name, value, url: baseURL! },
    { name: 'pjk_signed_in', value: 'member', url: baseURL! },
  ])
  const page = await context.newPage()
  await page.goto('/')
  await showsSignedOut(page)
  await expect.poll(() => hintOf(context)).toBeNull()
})

test('signing out everywhere signs out the other device too', async ({ browser, baseURL }) => {
  const { member } = await approvedArtist()
  const phone = await browser.newContext()
  const laptop = await browser.newContext()
  await signInAs(phone, member.id)
  await signInAs(laptop, member.id)
  const onLaptop = await laptop.newPage()
  await onLaptop.goto('/')
  await showsSignedIn(onLaptop, 'member')

  const onPhone = await phone.newPage()
  await onPhone.goto('/')
  const ended = await onPhone.request.post('/next/members/sign-out-everywhere', {
    headers: { origin: baseURL!, 'content-type': 'application/json' },
    data: {},
  })
  expect(ended.ok()).toBe(true)

  // The laptop finds out the next time it looks: coming back to the tab, or the next page
  await onLaptop.goto('/about')
  await showsSignedOut(onLaptop)
  await phone.close()
  await laptop.close()
})

test('a member of staff sees Admin, can sign out from the site, and only staff load the admin bar', async ({
  context,
}) => {
  await signInAsStaff(context)
  const page = await context.newPage()
  const meChecks: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/users/me') meChecks.push(r.url())
  })
  await page.goto('/')
  await showsSignedIn(page, 'staff')
  await expect.poll(() => meChecks.length).toBeGreaterThan(0)

  await header(page).getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL((url) => url.pathname === '/')
  await showsSignedOut(page)
  const after = meChecks.length
  await page.goto('/about')
  await showsSignedOut(page)
  expect(meChecks.length).toBe(after)
})

test('the cached page itself never carries anyone’s signed-in state', async ({ context }) => {
  const { member } = await approvedArtist()
  await signInAs(context, member.id)
  const html = await (await context.request.get('/')).text()
  expect(html).toContain('Sign in')
  expect(html).not.toContain('Sign out')
  expect(html).not.toContain(String(member.email))
})
