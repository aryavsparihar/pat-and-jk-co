import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { GATE_COOKIE } from '../../src/security/constants.js'
import { createGateToken } from '../../src/security/gateToken.js'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Signs in to the admin panel.
 *
 * Reaching /admin at all requires the one-time-code gate, so the test mints a gate token
 * for the same address instead of going through the email step.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  const { token } = createGateToken(user.email)
  await page.context().addCookies([
    {
      name: GATE_COOKIE,
      value: token,
      url: serverURL,
      httpOnly: true,
      sameSite: 'Strict',
    },
  ])

  await page.goto(`${serverURL}/admin/login`)
  await page.waitForLoadState('networkidle')

  // On a cold development server the form can finish loading after the fields are filled, and
  // empty them; fill again until both values have stuck
  await expect(async () => {
    await page.fill('#field-email', user.email)
    await page.fill('#field-password', user.password)
    await page.waitForTimeout(500)
    await expect(page.locator('#field-email')).toHaveValue(user.email, { timeout: 1000 })
    await expect(page.locator('#field-password')).toHaveValue(user.password, { timeout: 1000 })
  }).toPass({ timeout: 60_000 })
  await page.click('button[type="submit"]')

  await page.waitForURL(`${serverURL}/admin`)

  const dashboardArtifact = page.locator('span[title="Dashboard"]')
  await expect(dashboardArtifact).toBeVisible()
}
