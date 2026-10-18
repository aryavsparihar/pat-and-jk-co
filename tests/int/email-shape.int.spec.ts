// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isCompanyEmail, isEmail } from '@/security/constants'
import { isEmailShaped, MAX_EMAIL_LENGTH } from '@/utilities/emailShape'

/*
 * The email check runs on text anyone can send (the public forms, the admin gate, member
 * sign-in), so besides telling addresses from non-addresses it must take time in proportion to
 * the text, never more: the pattern it replaced could be made to try every split of a long
 * string (CodeQL js/polynomial-redos).
 */

describe('isEmailShaped', () => {
  it('accepts ordinary addresses', () => {
    for (const address of [
      'asha@example.com',
      'first.last+tag@mail.example.co.in',
      'a@b.c',
      "o'brien@example.org",
    ]) {
      expect(isEmailShaped(address), address).toBe(true)
    }
  })

  it('refuses what is not an address', () => {
    for (const text of [
      '',
      'asha',
      'asha@',
      '@example.com',
      'asha@example',
      'asha@example.',
      'asha@.example.com',
      'asha@example..com',
      'asha @example.com',
      'asha@exa mple.com',
      'a@b@example.com',
    ]) {
      expect(isEmailShaped(text), text).toBe(false)
    }
  })

  it('asks for a two-letter ending when told to', () => {
    expect(isEmailShaped('a@b.c', { tld: true })).toBe(false)
    expect(isEmailShaped('a@b.co', { tld: true })).toBe(true)
    expect(isEmailShaped('a@mail.example.in', { tld: true })).toBe(true)
  })

  it('refuses anything longer than an address can be', () => {
    const local = 'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length + 1)
    expect(isEmailShaped(`${local}@example.com`)).toBe(false)
    expect(isEmailShaped(`${local.slice(1)}@example.com`)).toBe(true)
  })

  it('answers at once for the strings that made the old pattern work hardest', () => {
    const crafted = [
      // The worst case for the old pattern: 1.8 seconds at 40,000 characters, and four times
      // longer each time the length doubles
      `a@${'.'.repeat(50_000)}@`,
      `a@${'.'.repeat(50_000)}`,
      `a@${'a.'.repeat(25_000)}`,
      `${'a'.repeat(50_000)}@`,
    ]
    for (const text of crafted) {
      const started = performance.now()
      expect(isEmailShaped(text)).toBe(false)
      // The length check alone refuses them; even the pattern on 254 characters is instant
      expect(performance.now() - started).toBeLessThan(20)
    }
    const started = performance.now()
    expect(isEmailShaped(`a@${'.'.repeat(MAX_EMAIL_LENGTH - 3)}@`)).toBe(false)
    expect(performance.now() - started).toBeLessThan(20)
  })
})

describe('the checks built on it', () => {
  it('keeps the company and any-address checks as they were', () => {
    expect(isEmail('  Asha@Example.COM ')).toBe(true)
    expect(isEmail('not an address')).toBe(false)
    expect(isCompanyEmail('someone@notpjk.co.in')).toBe(false)
    expect(isCompanyEmail(`x@${'.'.repeat(60_000)}pjk.co.in`)).toBe(false)
  })
})
