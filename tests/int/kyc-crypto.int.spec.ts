import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  blindIndex,
  KycCryptoError,
  masterKeys,
  newDataKey,
  openField,
  openFile,
  rewrapDataKey,
  sealField,
  sealFile,
  unwrapDataKey,
  wrapDataKey,
} from '@/kyc/crypto'
import {
  isAadhaarLast4,
  isAccountNumber,
  isIfsc,
  looksLikeFullAadhaar,
  maskAadhaar,
  maskAccount,
  maskIfsc,
  maskPan,
  namesPlausiblyMatch,
  panProblem,
} from '@/kyc/values'

/*
 * Every value here is made up: the PAN, IFSC and account numbers have the right shape and belong
 * to nobody. Keys are generated per test and thrown away.
 */
const PAN = 'ABCPE1234F'
const ACCOUNT = '123456784821'
const randomKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')

const saved = { ...process.env }
beforeEach(() => {
  process.env.KYC_ENCRYPTION_KEY = randomKey()
  process.env.KYC_BLIND_INDEX_KEY = randomKey()
  delete process.env.KYC_ENCRYPTION_KEY_PREVIOUS
})
afterEach(() => {
  process.env = { ...saved }
})

describe('field encryption', () => {
  it('round-trips, and every encryption of the same value looks different', () => {
    const key = newDataKey()
    const a = sealField(key, PAN, 'member:1:pan')
    const b = sealField(key, PAN, 'member:1:pan')
    expect(a).not.toBe(b)
    expect(a).not.toContain(PAN)
    expect(openField(key, a, 'member:1:pan')).toBe(PAN)
  })

  it('detects tampering with the ciphertext or its tag', () => {
    const key = newDataKey()
    const sealed = sealField(key, PAN, 'member:1:pan')
    const [v, iv, ct, tag] = sealed.split('.')
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1)
    expect(() => openField(key, [v, iv, flip(ct!), tag].join('.'), 'member:1:pan')).toThrow(
      KycCryptoError,
    )
    expect(() => openField(key, [v, iv, ct, flip(tag!)].join('.'), 'member:1:pan')).toThrow(
      KycCryptoError,
    )
  })

  it('refuses a value moved to another member or another field', () => {
    const key = newDataKey()
    const sealed = sealField(key, PAN, 'member:1:pan')
    expect(() => openField(key, sealed, 'member:2:pan')).toThrow(KycCryptoError)
    expect(() => openField(key, sealed, 'member:1:accountNumber')).toThrow(KycCryptoError)
  })

  it('refuses the wrong data key, and says nothing about the value when it does', () => {
    const sealed = sealField(newDataKey(), PAN, 'member:1:pan')
    try {
      openField(newDataKey(), sealed, 'member:1:pan')
      expect.unreachable()
    } catch (error) {
      expect(String(error)).not.toContain(PAN)
    }
  })
})

describe('data keys and master keys', () => {
  it('wraps a data key so only the master key can unwrap it', () => {
    const key = newDataKey()
    const wrapped = wrapDataKey(key, 'member:1')
    expect(unwrapDataKey(wrapped, 'member:1').equals(key)).toBe(true)
    expect(() => unwrapDataKey(wrapped, 'member:2')).toThrow(KycCryptoError)
    process.env.KYC_ENCRYPTION_KEY = randomKey()
    expect(() => unwrapDataKey(wrapped, 'member:1')).toThrow(/not configured/)
  })

  it('rotates: old records still open with the previous key, and re-wrap under the new one', () => {
    const dataKey = newDataKey()
    const sealed = sealField(dataKey, ACCOUNT, 'member:7:accountNumber')
    const wrappedOld = wrapDataKey(dataKey, 'member:7')
    const oldId = masterKeys().current.id

    // Rotation: a new key goes live, the old one stays as "previous"
    process.env.KYC_ENCRYPTION_KEY_PREVIOUS = process.env.KYC_ENCRYPTION_KEY
    process.env.KYC_ENCRYPTION_KEY = randomKey()
    expect(unwrapDataKey(wrappedOld, 'member:7').equals(dataKey)).toBe(true)

    const rewrapped = rewrapDataKey(wrappedOld, 'member:7')
    expect(rewrapped.keyId).toBe(masterKeys().current.id)
    expect(rewrapped.keyId).not.toBe(oldId)

    // Once the old key is removed, only the re-wrapped key still opens the data
    delete process.env.KYC_ENCRYPTION_KEY_PREVIOUS
    expect(() => unwrapDataKey(wrappedOld, 'member:7')).toThrow()
    const recovered = unwrapDataKey(rewrapped, 'member:7')
    expect(openField(recovered, sealed, 'member:7:accountNumber')).toBe(ACCOUNT)
  })

  it('refuses a malformed key and the same key twice', () => {
    process.env.KYC_ENCRYPTION_KEY = Buffer.from('too short').toString('base64')
    expect(() => masterKeys()).toThrow(/32 bytes/)
    process.env.KYC_ENCRYPTION_KEY = randomKey()
    process.env.KYC_ENCRYPTION_KEY_PREVIOUS = process.env.KYC_ENCRYPTION_KEY
    expect(() => masterKeys()).toThrow(/same key/)
  })
})

describe('file encryption', () => {
  it('round-trips a document and detects any change to it', () => {
    const key = newDataKey()
    const document = Buffer.from('%PDF-1.7 a made-up document')
    const sealed = sealFile(key, document, 'member:1:doc:5')
    expect(sealed.includes(document)).toBe(false)
    expect(openFile(key, sealed, 'member:1:doc:5').equals(document)).toBe(true)
    const tampered = Buffer.from(sealed)
    tampered[20] = tampered[20]! ^ 1
    expect(() => openFile(key, tampered, 'member:1:doc:5')).toThrow(KycCryptoError)
    expect(() => openFile(key, sealed, 'member:1:doc:6')).toThrow(KycCryptoError)
  })
})

describe('blind indexes', () => {
  it('find duplicates without decrypting, however the value was typed', () => {
    expect(blindIndex('pan', 'abcpe1234f')).toBe(blindIndex('pan', ' ABCPE 1234F'))
    expect(blindIndex('account', '1234-5678-4821')).toBe(blindIndex('account', '123456784821'))
    expect(blindIndex('pan', PAN)).not.toBe(blindIndex('pan', 'ABCPE1234G'))
    expect(blindIndex('pan', PAN)).not.toContain(PAN)
  })

  it('mean nothing under another key', () => {
    const before = blindIndex('pan', PAN)
    process.env.KYC_BLIND_INDEX_KEY = randomKey()
    expect(blindIndex('pan', PAN)).not.toBe(before)
  })

  it('must not share a key with encryption', () => {
    process.env.KYC_BLIND_INDEX_KEY = process.env.KYC_ENCRYPTION_KEY
    expect(() => blindIndex('pan', PAN)).toThrow(/different key/)
  })
})

describe('KYC value rules', () => {
  it('know an individual’s PAN', () => {
    expect(panProblem('ABCPE1234F')).toBeNull()
    expect(panProblem('abcpe1234f')).toBeNull()
    expect(panProblem('ABCCE1234F')).toBe('not-individual') // a company's PAN
    expect(panProblem('ABCPE12345')).toBe('format')
  })

  it('know an IFSC and an account number', () => {
    expect(isIfsc('SBIN0001234')).toBe(true)
    expect(isIfsc('sbin0001234')).toBe(true)
    expect(isIfsc('SBIN1001234')).toBe(false) // fifth character must be zero
    expect(isAccountNumber('12345678')).toBe(false)
    expect(isAccountNumber('123456789')).toBe(true)
    expect(isAccountNumber('1234567890123456789')).toBe(false)
  })

  it('accept only the last four digits of an Aadhaar number', () => {
    expect(isAadhaarLast4('4821')).toBe(true)
    expect(isAadhaarLast4('48211')).toBe(false)
    expect(looksLikeFullAadhaar('1234 5678 9012')).toBe(true)
  })

  it('mask for display', () => {
    expect(maskPan(PAN)).toBe('ABCxxxxx4F')
    expect(maskAccount(ACCOUNT)).toBe('XXXXXXXX4821')
    expect(maskAadhaar('4821')).toBe('XXXX XXXX 4821')
    expect(maskIfsc('SBIN0001234')).toBe('SBIN0xxxxxx')
  })

  it('warn about names that plainly do not match, but allow how banks write them', () => {
    expect(namesPlausiblyMatch('Asha Example', 'ASHA K EXAMPLE')).toBe(true)
    expect(namesPlausiblyMatch('Asha Example', 'Mrs. Example Asha')).toBe(true)
    expect(namesPlausiblyMatch('Asha Example', 'Ravi Kumar')).toBe(false)
  })
})
