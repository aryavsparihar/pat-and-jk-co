import { resolveMx } from 'node:dns/promises'

import { isDisposableEmailDomain } from 'disposable-email-domains-js'

/**
 * Whether an address someone gives us can be used (the founder's brief of 25 November 2026,
 * section 12): any well-formed address whose domain has an MX record, so mail can reach it, and
 * not one from a throwaway-address provider. The list of providers is the open-source
 * disposable-email-domains list (CC0), as packaged in disposable-email-domains-js.
 *
 * The lookup never blocks someone because our own DNS is having trouble: only a domain that does
 * not exist, has no MX record, or says it takes no mail ("null MX", RFC 7505) is refused.
 * Outside production, the reserved test domains (RFC 2606 and 6761) are let through without a
 * lookup, so tests and local work use made-up addresses.
 */

/** The founder's wording (error document of 25 November 2026, section 1) */
export const EMAIL_ADDRESS_ERRORS = {
  cannotReceive: 'That address cannot receive email. Please check it, or use another one.',
  throwaway: 'Please use an email address you keep. Temporary addresses cannot be used here.',
} as const

const TEST_DOMAIN = /(^|\.)(test|example|invalid|localhost)$|(^|\.)example\.(com|net|org)$/i

const LOOKUP_MS = 3000
const KEEP_MS = 60 * 60 * 1000
const known = new Map<string, { receives: boolean; at: number }>()

/** True unless the domain plainly cannot take mail; unknown when DNS itself fails */
const domainReceivesMail = async (domain: string): Promise<boolean> => {
  const cached = known.get(domain)
  if (cached && Date.now() - cached.at < KEEP_MS) return cached.receives
  let receives = true
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })),
          LOOKUP_MS,
        ),
      ),
    ])
    // A null MX ("0 .") says the domain takes no mail at all
    receives = records.some((r) => r.exchange && r.exchange !== '.')
  } catch (error) {
    const code = (error as { code?: string }).code
    // The domain does not exist, or exists with no MX record: nowhere to deliver
    if (code === 'ENOTFOUND' || code === 'ENODATA') receives = false
    // Anything else is our lookup failing, not their address: let it through, and do not keep it
    else return true
  }
  known.set(domain, { receives, at: Date.now() })
  return receives
}

/**
 * Null when the address can be used; otherwise the line to show. Expects an address already
 * checked for its shape (isEmail) and normalised.
 */
export const emailAddressProblem = async (email: string): Promise<string | null> => {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  if (!domain) return EMAIL_ADDRESS_ERRORS.cannotReceive
  if (isDisposableEmailDomain(domain)) return EMAIL_ADDRESS_ERRORS.throwaway
  if (process.env.NODE_ENV !== 'production' && TEST_DOMAIN.test(domain)) return null
  return (await domainReceivesMail(domain)) ? null : EMAIL_ADDRESS_ERRORS.cannotReceive
}
