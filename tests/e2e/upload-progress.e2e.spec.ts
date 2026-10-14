import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import {
  cleanUp,
  fillEarlySteps,
  openApplications,
  signInWithCode,
  uniqueEmail,
} from '../helpers/e2e'

/*
 * The upload bar tells the truth: on a slow connection a large picture climbs through real
 * percentages as it is sent, then says it is being prepared, with no number, while the server
 * checks and re-encodes it; only then is the work added.
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

/** A large photograph-like picture: random detail compresses badly, so the file stays big */
const largePicture = async () => {
  const width = 2400
  const height = 1800
  const noise = Buffer.alloc(width * height * 3)
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24
  return sharp(noise, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer()
}

test('a large picture on a slow connection shows real progress, then its preparation', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.goto('/collaborate/artists')
  await signInWithCode(page, uniqueEmail('progress'))
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await fillEarlySteps(page)
  await page.reload()
  await page.getByRole('button', { name: /Step 4: Your work/ }).click()
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeVisible()

  const before = Number((await page.getByText(/of 10 works added/).textContent())!.match(/\d+/)![0])
  const picture = await largePicture()
  expect(picture.length).toBeGreaterThan(2_000_000)

  // Every value the bar announces, and every word under it, as they change
  await page.evaluate(() => {
    const seen: { values: number[]; words: string[] } = { values: [], words: [] }
    ;(window as unknown as { seen: typeof seen }).seen = seen
    new MutationObserver(() => {
      const bar = document.querySelector('[role="progressbar"]')
      if (!bar) return
      const now = bar.getAttribute('aria-valuenow')
      if (now !== null && seen.values.at(-1) !== Number(now)) seen.values.push(Number(now))
      const words = bar.getAttribute('aria-valuetext') ?? ''
      if (words && seen.words.at(-1) !== words) seen.words.push(words)
    }).observe(document.body, { subtree: true, childList: true, attributes: true })
  })

  // About 2 Mbit/s up: a phone on a middling connection
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: -1,
    uploadThroughput: 250_000,
  })
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'large.jpg', mimeType: 'image/jpeg', buffer: picture })

  await expect(page.getByText('Preparing your picture')).toBeVisible({ timeout: 120_000 })
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  await expect(page.getByText(`${before + 1} of 10 works added`)).toBeVisible({ timeout: 60_000 })

  const seen = await page.evaluate(
    () => (window as unknown as { seen: { values: number[]; words: string[] } }).seen,
  )
  // Real progress: many values on the way, rising, and none of them made up past what was sent
  const between = seen.values.filter((v) => v > 0 && v < 100)
  expect(between.length).toBeGreaterThan(5)
  expect([...between].sort((a, b) => a - b)).toEqual(between)
  // Then the preparation, with no number, before the work arrives
  expect(seen.words).toContain('Preparing your picture')
  expect(seen.words.indexOf('Preparing your picture')).toBeGreaterThan(
    seen.words.findIndex((w) => w.startsWith('Sending, ')),
  )
})
