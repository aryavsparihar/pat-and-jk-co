// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * Which addresses can be used: any well-formed one whose domain has an MX record, never a
 * throwaway provider's. DNS is stood in for, so the test needs no network.
 */

const answers: Record<string, () => unknown> = {}
vi.mock('node:dns/promises', () => ({
  resolveMx: vi.fn(async (domain: string) => {
    const answer = answers[domain]
    if (!answer) throw Object.assign(new Error('no such domain'), { code: 'ENOTFOUND' })
    return answer()
  }),
}))

const { EMAIL_ADDRESS_ERRORS: E, emailAddressProblem } = await import('@/security/emailAddress')

afterEach(() => vi.unstubAllEnvs())

describe('an email address', () => {
  it('from a throwaway provider is refused, wherever the site runs', async () => {
    expect(await emailAddressProblem('someone@mailinator.com')).toBe(E.throwaway)
  })

  it('at a made-up test domain passes outside production only', async () => {
    expect(await emailAddressProblem('asha@kyc.example.test')).toBeNull()
    vi.stubEnv('NODE_ENV', 'production')
    expect(await emailAddressProblem('asha@kyc.example.test')).toBe(E.cannotReceive)
  })

  it('needs a domain that takes mail', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    answers['takes-mail.in'] = () => [{ exchange: 'mx.takes-mail.in', priority: 10 }]
    answers['no-mail.in'] = () => {
      throw Object.assign(new Error('no MX'), { code: 'ENODATA' })
    }
    // A "null MX" says the domain takes no mail at all
    answers['null-mx.in'] = () => [{ exchange: '.', priority: 0 }]
    expect(await emailAddressProblem('asha@takes-mail.in')).toBeNull()
    expect(await emailAddressProblem('asha@no-mail.in')).toBe(E.cannotReceive)
    expect(await emailAddressProblem('asha@null-mx.in')).toBe(E.cannotReceive)
    expect(await emailAddressProblem('asha@no-such-domain.in')).toBe(E.cannotReceive)
  })

  it('is let through when our own lookup fails, rather than refuse someone for it', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    answers['dns-trouble.in'] = () => {
      throw Object.assign(new Error('server failure'), { code: 'ESERVFAIL' })
    }
    expect(await emailAddressProblem('asha@dns-trouble.in')).toBeNull()
  })
})
