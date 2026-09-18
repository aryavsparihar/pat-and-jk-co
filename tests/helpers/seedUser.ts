import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser = {
  email: 'e2e-test@pjk.co.in',
  password: 'E2e-Test-Passw0rd!',
  name: 'E2E Test',
}

/**
 * Seeds a super-admin account for the admin end-to-end tests, and removes it afterwards.
 * The address has to be at the company domain, like every real account.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: { email: { equals: testUser.email } },
  })

  await payload.create({
    collection: 'users',
    data: { ...testUser, roles: ['super-admin'], status: 'active' } as never,
  })
}

export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: { email: { equals: testUser.email } },
  })
}
