import { expect, test } from '@playwright/test'

import {
  cleanUp,
  fillEarlySteps,
  openApplications,
  signInWithCode,
  uniqueEmail,
} from '../helpers/e2e'

/*
 * "Use my location" on the address step's map: with permission, the pin goes to the device's
 * position, the coordinates show as it moves, and they are saved with the step; without it, a kind
 * word and the map stays usable. These run without a Google key, on OpenStreetMap's map, which is
 * what the site shows until the key is set.
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

const toAddressStep = async (page: import('@playwright/test').Page) => {
  await page.goto('/collaborate/artists')
  await signInWithCode(page, uniqueEmail('map'))
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await fillEarlySteps(page)
  await page.reload()
  await page.getByRole('button', { name: /^Step 2:/ }).click()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
}

test.describe('with permission', () => {
  test.use({
    geolocation: { latitude: 32.3863, longitude: 75.5178 },
    permissions: ['geolocation'],
  })

  test('puts the pin where the device is, shows it, and saves it', async ({ page }) => {
    await toAddressStep(page)
    // Nothing from the map loads until it is asked for
    expect(await page.locator('.leaflet-container').count()).toBe(0)
    await page.getByRole('button', { name: 'Use my location' }).first().click()
    await expect(page.getByText('Pin at 32.38630° N, 75.51780° E')).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Save and continue' }).click()
    await expect(page.getByRole('heading', { name: 'Your practice' })).toBeVisible()
    const saved = await page.evaluate(() =>
      fetch('/next/members/application?type=artist').then((r) => r.json()),
    )
    expect(saved.application.address.residence.latitude).toBeCloseTo(32.3863, 4)
    expect(saved.application.address.residence.longitude).toBeCloseTo(75.5178, 4)
  })
})

test('says so kindly when location is refused, and the map still works', async ({ page }) => {
  await toAddressStep(page)
  await page.getByRole('button', { name: 'Use my location' }).first().click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'your location stays with you' }),
  ).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close the map' })).toBeVisible()
})
