import { expect, test } from '@playwright/test'

// Runs against a seeded local database (`pnpm seed`)
test.describe('Frontend', () => {
  test('homepage shows the PJK brand and navigation', async ({ page }) => {
    await page.goto('http://localhost:3000')
    await expect(page).toHaveTitle(/PAT and J\.K\. Co\./)
    await expect(page.locator('h1').first()).toContainText('Building enduring ventures')
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const label of ['About', 'Ventures', 'Leadership', 'Journal', 'Collaborate']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible()
    }
  })

  test('flagship venture page renders', async ({ page }) => {
    await page.goto('http://localhost:3000/ventures/phulhaar-gallery')
    await expect(page.locator('h1')).toHaveText('Phulhaar Gallery by PJK')
  })

  test('contact page renders the enquiry form', async ({ page }) => {
    await page.goto('http://localhost:3000/contact')
    await expect(page.getByLabel(/Full name/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Send enquiry/ })).toBeVisible()
  })

  test('unknown pages return the branded 404', async ({ page }) => {
    const response = await page.goto('http://localhost:3000/does-not-exist')
    expect(response?.status()).toBe(404)
    await expect(page.getByText('Page not found').first()).toBeVisible()
  })
})
