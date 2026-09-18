/**
 * Creates (or repairs) a super-admin account.
 *
 *   ADMIN_EMAIL=aryaveer@pjk.co.in ADMIN_PASSWORD='…' pnpm create-admin
 *
 * The password is read from the environment and never written to the repository, printed,
 * or stored anywhere but Payload's own salted hash. Run it again to reset a password or to
 * re-activate a locked account.
 */
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { isCompanyEmail, normaliseEmail, COMPANY_EMAIL_DOMAIN } from '@/security/constants'
import { passwordProblem } from '@/security/otp'

const fail = (message: string): never => {
  console.error(`\n✕ ${message}\n`)
  process.exit(1)
}

const email = normaliseEmail(process.env.ADMIN_EMAIL)
const password = process.env.ADMIN_PASSWORD ?? ''
const name = process.env.ADMIN_NAME || 'Super admin'

if (!email || !password) {
  fail(
    "Set both ADMIN_EMAIL and ADMIN_PASSWORD, e.g.\n  ADMIN_EMAIL=aryaveer@pjk.co.in ADMIN_PASSWORD='your-password' pnpm create-admin",
  )
}
if (!isCompanyEmail(email)) fail(`The address must end in @${COMPANY_EMAIL_DOMAIN}.`)

const weak = passwordProblem(password, email)
if (weak) fail(`That password is too weak. ${weak}`)

const payload = await getPayload({ config: configPromise })

const existing = await payload.find({
  collection: 'users',
  where: { email: { equals: email } },
  limit: 1,
  overrideAccess: true,
})

if (existing.docs[0]) {
  await payload.update({
    collection: 'users',
    id: existing.docs[0].id,
    data: { password, roles: ['super-admin'], status: 'active', loginAttempts: 0, lockUntil: null },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  console.log(`\n✓ Updated ${email}: super admin, active, new password set.`)
} else {
  await payload.create({
    collection: 'users',
    data: { email, name, password, roles: ['super-admin'], status: 'active' },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  console.log(`\n✓ Created ${email} as a super admin.`)
}

console.log(
  [
    '',
    'To sign in:',
    '  1. Open /admin-access and enter this address',
    '  2. Enter the one-time code emailed to it',
    '     (in development, with no email service configured, the code is printed in the dev-server terminal)',
    '  3. Enter the password at the admin sign-in screen',
    '',
  ].join('\n'),
)

process.exit(0)
