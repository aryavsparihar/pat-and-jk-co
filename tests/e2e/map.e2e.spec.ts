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
 * what the site shows until the key is set. The device is put in Kathua (32.37, 75.52).
 *
 * The newer tests answer the tile and place-search requests themselves, so they never lean on
 * OpenStreetMap's, Esri's or OpenTopoMap's servers, and can read the zoom from the tiles asked for.
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

const KATHUA = { latitude: 32.37, longitude: 75.52 }

// A 1×1 transparent PNG, for every tile
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/** Answers the map's outside requests here; returns the place searches the page made */
const answerMapRequests = async (page: import('@playwright/test').Page) => {
  const searches: URL[] = []
  for (const host of [
    'https://tile.openstreetmap.org/**',
    'https://server.arcgisonline.com/**',
    'https://*.tile.opentopomap.org/**',
  ]) {
    await page.route(host, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: TILE }),
    )
  }
  await page.route('https://nominatim.openstreetmap.org/**', (route) => {
    searches.push(new URL(route.request().url()))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ lat: '32.3869', lon: '75.5172', display_name: 'Kathua' }]),
    })
  })
  return searches
}

/** The zoom level the map is showing, from the tiles it last asked for */
const tilesAtZoom = (page: import('@playwright/test').Page, zoom: number) =>
  page.locator(`.location-map img.leaflet-tile[src*="/${zoom}/"]`)

const toAddressStep = async (page: import('@playwright/test').Page) => {
  await page.goto('/collaborate/artists')
  await signInWithCode(page, uniqueEmail('map'))
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await fillEarlySteps(page)
  await page.reload()
  await page.getByRole('button', { name: /^Step 2:/ }).click()
  await expect(page.getByRole('heading', { name: 'Where you live' })).toBeVisible()
}

test.describe('with permission, on a phone-like fix', () => {
  test.use({
    geolocation: { ...KATHUA, accuracy: 20 },
    permissions: ['geolocation'],
  })

  test('puts the pin where the device is, shows it, and saves it', async ({ page }) => {
    await toAddressStep(page)
    // Nothing from the map loads until it is asked for
    expect(await page.locator('.leaflet-container').count()).toBe(0)
    await page.getByRole('button', { name: 'Use my location' }).first().click()
    await expect(page.getByText('Pin at 32.37000° N, 75.52000° E')).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Save and continue' }).click()
    await expect(page.getByRole('heading', { name: 'Your practice' })).toBeVisible()
    const saved = await page.evaluate(() =>
      fetch('/next/members/application?type=artist').then((r) => r.json()),
    )
    expect(saved.application.address.residence.latitude).toBeCloseTo(32.37, 4)
    expect(saved.application.address.residence.longitude).toBeCloseTo(75.52, 4)
  })

  test('draws the accuracy circle, zooms to street level, and does not call it approximate', async ({
    page,
  }) => {
    await answerMapRequests(page)
    await toAddressStep(page)
    await page.getByRole('button', { name: 'Use my location' }).first().click()
    await expect(page.getByText('Your device placed you within about 20 m')).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator('.location-map path.location-accuracy')).toHaveCount(1)
    await expect(tilesAtZoom(page, 18).first()).toBeAttached()
    await expect(page.getByText('This is approximate on computers')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeEnabled()
  })

  test('switches between Map, Satellite and Terrain', async ({ page }) => {
    await answerMapRequests(page)
    await toAddressStep(page)
    await page.getByRole('button', { name: 'Use my location' }).first().click()
    await expect(page.getByText('Pin at 32.37000° N, 75.52000° E')).toBeVisible({
      timeout: 30_000,
    })
    const styles = page.getByRole('group', { name: 'Map style' })
    const tiles = page.locator('.location-map img.leaflet-tile')
    await expect(styles.getByRole('button', { name: 'Map' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(tiles.first()).toHaveAttribute('src', /tile\.openstreetmap\.org/)

    await styles.getByRole('button', { name: 'Satellite' }).click()
    await expect(styles.getByRole('button', { name: 'Satellite' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      page.locator('.location-map img.leaflet-tile[src*="World_Imagery"]').first(),
    ).toBeAttached()
    await expect(page.locator('.location-map img.leaflet-tile[src*="openstreetmap"]')).toHaveCount(
      0,
    )
    await expect(page.locator('.location-map .leaflet-control-attribution')).toContainText('Esri')

    await styles.getByRole('button', { name: 'Terrain' }).click()
    await expect(
      page.locator('.location-map img.leaflet-tile[src*="opentopomap"]').first(),
    ).toBeAttached()
    await expect(page.locator('.location-map img.leaflet-tile[src*="arcgisonline"]')).toHaveCount(0)
    await expect(page.locator('.location-map .leaflet-control-attribution')).toContainText(
      'OpenTopoMap',
    )

    // The pin and its circle stay put through every change of look
    await expect(page.getByText('Pin at 32.37000° N, 75.52000° E')).toBeVisible()
    await expect(page.locator('.location-map path.location-accuracy')).toHaveCount(1)
  })

  test('the zoom buttons are big enough to press with a thumb', async ({ page }) => {
    await answerMapRequests(page)
    await toAddressStep(page)
    await page.getByRole('button', { name: 'Open the map' }).click()
    for (const name of ['Zoom in', 'Zoom out']) {
      const box = await page.getByRole('button', { name }).boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('with permission, on a computer-like fix', () => {
  test.use({
    geolocation: { ...KATHUA, accuracy: 3_000 },
    permissions: ['geolocation'],
  })

  test('says it is approximate, shows the circle, and zooms to the town', async ({ page }) => {
    await answerMapRequests(page)
    await toAddressStep(page)
    await page.getByRole('button', { name: 'Use my location' }).first().click()
    // After a few seconds of waiting for a better fix
    await expect(
      page.getByRole('alert').filter({
        hasText: 'This is approximate on computers. Drag the pin to your exact place.',
      }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Your device placed you within about 3 km')).toBeVisible()
    await expect(page.locator('.location-map path.location-accuracy')).toHaveCount(1)
    await expect(tilesAtZoom(page, 12).first()).toBeAttached()
  })

  test('moving the pin is never undone by a better fix arriving after', async ({ page }) => {
    await answerMapRequests(page)
    await toAddressStep(page)
    await page.getByRole('button', { name: 'Use my location' }).first().click()
    await expect(page.getByText('Pin at 32.37000° N, 75.52000° E')).toBeVisible({
      timeout: 30_000,
    })
    // From the keyboard: the arrow keys nudge the pin, which ends the wait for a better fix
    await page.locator('.location-map .location-pin').focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: 'Use my location' })).toBeEnabled()
    const status = page.getByRole('status').filter({ hasText: 'Pin at' })
    const moved = await status.textContent()
    expect(moved).not.toContain('32.37000° N, 75.52000° E')
    // The device then finds a better fix somewhere else: the pin stays where they put it
    await page.context().setGeolocation({ latitude: 32.38, longitude: 75.53, accuracy: 15 })
    await page.waitForTimeout(2_000)
    await expect(status).toHaveText(moved!)
  })
})

test('opens at the typed town, asking OpenStreetMap for the town only', async ({ page }) => {
  const searches = await answerMapRequests(page)
  await toAddressStep(page)
  await page.getByRole('button', { name: 'Open the map' }).click()
  await expect(tilesAtZoom(page, 12).first()).toBeAttached({ timeout: 30_000 })
  expect(searches).toHaveLength(1)
  expect(searches[0].searchParams.get('q')).toBe('Kathua, Jammu and Kashmir, India')
  expect(searches[0].searchParams.get('countrycodes')).toBe('in')
  // Never the street, the house or the PIN code
  expect(searches[0].toString()).not.toMatch(/Example|House|184101/)
  // Not placed until they move it
  await expect(page.getByRole('status').filter({ hasText: 'Pin at' })).toHaveCount(0)
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
