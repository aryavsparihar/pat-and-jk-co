/**
 * Break-glass: prints a gate cookie for one address, for the rare case where admin email
 * is down and nobody can receive a sign-in code.
 *
 *   ADMIN_EMAIL=aryaveer@pjk.co.in pnpm gate-token
 *
 * It replaces only the emailed code — the account's password is still required afterwards.
 * Running it needs access to the server environment (PAYLOAD_SECRET), which already implies
 * full control of the system, so it grants nothing extra to an outsider.
 */
import { isCompanyEmail, GATE_COOKIE, normaliseEmail } from '@/security/constants'
import { createGateToken } from '@/security/gateToken'

const email = normaliseEmail(process.env.ADMIN_EMAIL)

if (!isCompanyEmail(email)) {
  console.error(
    '\n✕ Set ADMIN_EMAIL to a company address, e.g. ADMIN_EMAIL=aryaveer@pjk.co.in pnpm gate-token\n',
  )
  process.exit(1)
}

const { token, expiresAt } = createGateToken(email)

console.log(
  [
    '',
    `Gate cookie for ${email}, valid until ${expiresAt.toISOString()}:`,
    '',
    `  ${GATE_COOKIE}=${token}`,
    '',
    'To use it: open the site, then in the browser console run',
    `  document.cookie = "${GATE_COOKIE}=<the value above>; path=/"`,
    'and go to /admin. You will still be asked for the password.',
    '',
  ].join('\n'),
)

process.exit(0)
