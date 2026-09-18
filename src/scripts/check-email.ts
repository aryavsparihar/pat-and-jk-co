/**
 * Checks that sign-in codes and enquiry notifications can actually be delivered.
 *
 *   pnpm check-email                      # settings + DNS only
 *   pnpm check-email you@pjk.co.in        # also sends a real test message
 *
 * Run it after adding the Resend DNS records, and again after setting RESEND_API_KEY.
 */
import { Resolver, resolveMx, resolveNs, resolveTxt } from 'node:dns/promises'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { COMPANY_EMAIL_DOMAIN, isCompanyEmail, normaliseEmail } from '@/security/constants'

const tick = (ok: boolean) => (ok ? '✓' : '✕')
const domain = COMPANY_EMAIL_DOMAIN
const recipient = normaliseEmail(process.argv[2])

/**
 * Looks up TXT records, falling back to the domain's own nameservers. Public resolvers cache
 * "this does not exist" answers for a while, which otherwise makes a freshly added record
 * look missing long after it is live.
 */
const lookupTxt = async (name: string): Promise<string[]> => {
  try {
    const records = await resolveTxt(name)
    if (records.length) return records.map((parts) => parts.join(''))
  } catch {
    // fall through to the authoritative lookup
  }

  try {
    const nameservers = await resolveNs(domain)
    const authoritative = new Resolver()
    const addresses = await Promise.all(
      nameservers.slice(0, 2).map((ns) => new Resolver().resolve4(ns).catch(() => [])),
    )
    const ips = addresses.flat()
    if (!ips.length) return []
    authoritative.setServers(ips)
    return (await authoritative.resolveTxt(name)).map((parts) => parts.join(''))
  } catch {
    return []
  }
}

console.log(`\nEmail check for ${domain}\n${'─'.repeat(40)}`)

// 1. Settings
const apiKey = process.env.RESEND_API_KEY
const from = process.env.EMAIL_FROM_ADDRESS || 'noreply@' + domain
console.log(`${tick(Boolean(apiKey))} RESEND_API_KEY ${apiKey ? 'is set' : 'is missing (.env)'}`)
console.log(`  From address: ${from}`)
console.log(`  Enquiries inbox: ${process.env.CONTACT_INBOX || 'hello@' + domain}`)

// 2. Can the company mailbox receive anything at all?
try {
  const mx = await resolveMx(domain)
  const hosts = mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange)
  console.log(`${tick(hosts.length > 0)} Mail for ${domain} is handled by: ${hosts.join(', ')}`)
} catch {
  console.log(`✕ No MX records for ${domain} — nobody can receive mail there yet`)
}

// 3. Sending records for Resend
const dkim = await lookupTxt(`resend._domainkey.${domain}`)
console.log(
  `${tick(dkim.length > 0)} DKIM record at resend._domainkey.${domain} ${dkim.length ? 'found' : 'not found yet'}`,
)
if (!dkim.length)
  console.log('  (a public resolver may still be caching “not found” — wait a few minutes)')

const sendSpf = await lookupTxt(`send.${domain}`)
const rootSpf = (await lookupTxt(domain)).filter((value) => value.startsWith('v=spf1'))
console.log(
  `${tick(sendSpf.length > 0)} SPF record at send.${domain} ${sendSpf.length ? sendSpf.join(' ') : 'not found yet'}`,
)
if (rootSpf.length) console.log(`  Existing SPF on the root domain: ${rootSpf.join(' ')}`)
if (rootSpf.length > 1)
  console.log('  ⚠ More than one SPF record on the root domain — merge them into one')

// 4. Send a real message
if (recipient) {
  if (!isCompanyEmail(recipient)) {
    console.log(
      `\n✕ ${recipient} is not an @${domain} address — codes are only ever sent to company addresses`,
    )
    process.exit(1)
  }
  const payload = await getPayload({ config: configPromise })
  if (!apiKey) {
    console.log('\n✕ Cannot send: RESEND_API_KEY is not set in .env')
    process.exit(1)
  }
  try {
    await payload.sendEmail({
      to: recipient,
      subject: 'PJK email test',
      text: 'If you are reading this, sign-in codes and enquiry notifications will arrive.',
    })
    console.log(`\n✓ Test message sent to ${recipient}. Check that inbox (and its spam folder).`)
  } catch (error) {
    console.log(`\n✕ Sending failed: ${(error as Error).message}`)
    process.exit(1)
  }
} else {
  console.log(`\nTo send a real test: pnpm check-email aryaveer@${domain}`)
}

console.log('')
process.exit(0)
