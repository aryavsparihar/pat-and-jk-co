// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { checkMaskedAadhaar } from '@/kyc/aadhaarCheck'

/*
 * The masked e-Aadhaar check, against made-up PDFs signed by a made-up certificate chain
 * (scripts/fixtures/make-eaadhaar-fixtures.py). Nothing here is a real person or a real document.
 */
const dir = path.resolve(__dirname, '../fixtures/eaadhaar')
const fixture = (name: string) => readFileSync(path.join(dir, name))
const roots = [readFileSync(path.join(dir, 'test-root.pem'), 'utf8')]
const good = {
  password: 'ASHA1990',
  last4: '4821',
  panName: 'Asha Example',
  dateOfBirth: '1990-04-12',
  roots,
}

describe('the masked e-Aadhaar check', () => {
  it('verifies the original, signed, masked PDF whose details match', async () => {
    const check = await checkMaskedAadhaar({ file: fixture('masked-signed.pdf'), ...good })
    expect(check.reasons).toEqual([])
    expect(check.result).toBe('verified')
    expect(check.signer).toMatch(/Unique Identification Authority of India/)
    expect(check.signedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('notices a file changed after signing, or tampered with', async () => {
    for (const name of ['masked-changed-after-signing.pdf', 'masked-tampered.pdf']) {
      const check = await checkMaskedAadhaar({ file: fixture(name), ...good })
      expect(check.result, name).toBe('not-verified')
    }
    const changed = await checkMaskedAadhaar({
      file: fixture('masked-changed-after-signing.pdf'),
      ...good,
    })
    expect(changed.reasons.join(' ')).toMatch(/changed after UIDAI signed it/)
  })

  it('refuses a signature from anyone but UIDAI, and an unsigned PDF', async () => {
    const stranger = await checkMaskedAadhaar({
      file: fixture('masked-signed-by-stranger.pdf'),
      ...good,
    })
    expect(stranger.result).toBe('not-verified')
    expect(stranger.reasons.join(' ')).toMatch(/not signed by UIDAI/)
    const unsigned = await checkMaskedAadhaar({ file: fixture('masked-unsigned.pdf'), ...good })
    expect(unsigned.reasons.join(' ')).toMatch(/no digital signature/)
  })

  it('does not trust a chain it has no root for', async () => {
    const check = await checkMaskedAadhaar({
      file: fixture('masked-signed.pdf'),
      ...good,
      roots: [],
    })
    expect(check.result).toBe('manual-review')
    expect(check.reasons.join(' ')).toMatch(/root certificates are not installed/)
  })

  it('trusts India’s CCA roots only: a chain from anywhere else is refused', async () => {
    // The real roots (src/kyc/ccaRoots.ts), not the test one: the made-up chain must fail
    const check = await checkMaskedAadhaar({
      file: fixture('masked-signed.pdf'),
      ...good,
      roots: undefined,
    })
    expect(check.result).toBe('not-verified')
    expect(check.reasons.join(' ')).toMatch(/does not chain to India’s CCA roots/)
  })

  it('carries the two document-signing CCA roots, with the recorded fingerprints', async () => {
    const { CCA_ROOTS_PEM } = await import('@/kyc/ccaRoots')
    const { X509Certificate } = await import('node:crypto')
    const fingerprints = CCA_ROOTS_PEM.map((pem) =>
      new X509Certificate(pem).fingerprint256.replace(/:/g, ''),
    )
    expect(fingerprints).toEqual([
      '9A3FD3176798E842DDCB12C262F11CFACCA70A8B84C6EA6FDA30842A95A94CD8',
      '60109BC6C38328598A112C7A25E38B0F23E5A7511CB815FB64E0C4FF05DB7DF7',
    ])
  })

  it('flags an unmasked copy so it is not kept', async () => {
    const check = await checkMaskedAadhaar({ file: fixture('unmasked-signed.pdf'), ...good })
    expect(check.result).toBe('not-verified')
    expect(check.unmasked).toBe(true)
    expect(JSON.stringify(check)).not.toContain('9999')
  })

  it('says which detail does not match, without repeating it', async () => {
    const check = await checkMaskedAadhaar({
      file: fixture('masked-signed.pdf'),
      ...good,
      last4: '1111',
      panName: 'Ravi Kumar',
      dateOfBirth: '1991-04-12',
    })
    expect(check.result).toBe('not-verified')
    const said = check.reasons.join(' ')
    expect(said).toMatch(/last four digits/)
    expect(said).toMatch(/not the name on the PAN/)
    expect(said).toMatch(/date of birth/)
    expect(said).not.toMatch(/4821|Asha|1990/)
  })

  it('asks for a hand check when it cannot read inside, or for a photo', async () => {
    const noPassword = await checkMaskedAadhaar({
      file: fixture('masked-signed.pdf'),
      ...good,
      password: undefined,
    })
    expect(noPassword.result).toBe('manual-review')
    const wrong = await checkMaskedAadhaar({
      file: fixture('masked-signed.pdf'),
      ...good,
      password: 'WRONG000',
    })
    expect(wrong.result).toBe('manual-review')
    expect(wrong.reasons.join(' ')).toMatch(/password given does not open/)
    const photo = await checkMaskedAadhaar({
      file: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
      ...good,
    })
    expect(photo.result).toBe('manual-review')
    expect(photo.reasons.join(' ')).toMatch(/photo or scan/)
  })
})

describe('dates of birth', () => {
  it('are read in India, whatever the server’s time zone', async () => {
    const { indianDate } = await import('@/kyc/aadhaarCheck')
    expect(indianDate('1990-04-12')).toBe('1990-04-12')
    // Midnight in India, as stored by a server running in India
    expect(indianDate('1990-04-11T18:30:00.000Z')).toBe('1990-04-12')
    // Midnight UTC, as stored by a server running in UTC
    expect(indianDate('1990-04-12T00:00:00.000Z')).toBe('1990-04-12')
    expect(indianDate(null)).toBeNull()
  })
})
