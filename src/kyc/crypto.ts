import 'server-only'

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

/**
 * The only place KYC data is encrypted or decrypted. Nothing else in the codebase touches a key.
 *
 * Envelope encryption, AES-256-GCM throughout:
 *
 *   master key (KYC_ENCRYPTION_KEY, 32 bytes)        lives only in the environment
 *     └─ wraps a data key per KYC record or document  stored wrapped, beside the data
 *          └─ encrypts each sensitive field / file    stored as ciphertext
 *
 * Every ciphertext is bound to where it belongs with additional authenticated data (the member
 * and the field), so a value cannot be cut from one record and pasted into another, or moved
 * between fields, without decryption failing. GCM's tag makes any tampering fail too.
 *
 * Master keys are identified by a short fingerprint stored with each wrapped key, so the master
 * key can be rotated: set the new key as KYC_ENCRYPTION_KEY and the old one as
 * KYC_ENCRYPTION_KEY_PREVIOUS, run `pnpm kyc:rotate-key` to re-wrap every data key, then remove
 * the old one. The data itself is never re-encrypted, only its keys.
 *
 * Blind indexes (HMAC-SHA256 under a separate key, KYC_BLIND_INDEX_KEY) let duplicates be found
 * without decrypting anything: the same PAN always gives the same index, and the index reveals
 * nothing about the PAN without the key.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32
const FORMAT = 'v1'

export class KycCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KycCryptoError'
  }
}

export type MasterKey = { id: string; key: Buffer }

const fingerprint = (key: Buffer) => createHash('sha256').update(key).digest('hex').slice(0, 16)

const parseKey = (value: string, name: string): MasterKey => {
  const key = Buffer.from(value.trim(), 'base64')
  if (key.length !== KEY_BYTES) {
    throw new KycCryptoError(
      `${name} must be ${KEY_BYTES} bytes, base64-encoded (openssl rand -base64 32)`,
    )
  }
  return { id: fingerprint(key), key }
}

/**
 * Development and tests only: keys derived from PAYLOAD_SECRET, so a fresh checkout works. In
 * production the real keys are required (src/env.ts refuses to start without them).
 */
const devKey = (purpose: string): string => {
  if (process.env.NODE_ENV === 'production') {
    throw new KycCryptoError(`The KYC keys are not set; refusing to ${purpose} in production`)
  }
  const base = process.env.PAYLOAD_SECRET
  if (!base) throw new KycCryptoError('PAYLOAD_SECRET is not set')
  return createHash('sha256').update(`kyc-dev:${purpose}:${base}`).digest('base64')
}

export const masterKeys = (): { current: MasterKey; previous: MasterKey | null } => {
  const current = parseKey(
    process.env.KYC_ENCRYPTION_KEY || devKey('encrypt'),
    'KYC_ENCRYPTION_KEY',
  )
  const previousValue = process.env.KYC_ENCRYPTION_KEY_PREVIOUS
  const previous = previousValue ? parseKey(previousValue, 'KYC_ENCRYPTION_KEY_PREVIOUS') : null
  if (previous && previous.id === current.id) {
    throw new KycCryptoError('KYC_ENCRYPTION_KEY_PREVIOUS is the same key as KYC_ENCRYPTION_KEY')
  }
  return { current, previous }
}

const blindKey = (): Buffer => {
  const value = process.env.KYC_BLIND_INDEX_KEY || devKey('index')
  const key = Buffer.from(value.trim(), 'base64')
  if (key.length !== KEY_BYTES) {
    throw new KycCryptoError(`KYC_BLIND_INDEX_KEY must be ${KEY_BYTES} bytes, base64-encoded`)
  }
  if (
    process.env.KYC_ENCRYPTION_KEY &&
    key.equals(Buffer.from(process.env.KYC_ENCRYPTION_KEY, 'base64'))
  ) {
    throw new KycCryptoError('KYC_BLIND_INDEX_KEY must be a different key from KYC_ENCRYPTION_KEY')
  }
  return key
}

/* ─── Low level ─────────────────────────────────────────────────────────── */

const encrypt = (key: Buffer, plaintext: Buffer, aad: string) => {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { iv, ciphertext, tag: cipher.getAuthTag() }
}

const decrypt = (key: Buffer, iv: Buffer, ciphertext: Buffer, tag: Buffer, aad: string): Buffer => {
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    // Never says why: a wrong key, a tampered value and a value from elsewhere look the same
    throw new KycCryptoError('A KYC value could not be decrypted')
  }
}

const b64 = (b: Buffer) => b.toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url')

/* ─── Data keys ─────────────────────────────────────────────────────────── */

/** A fresh data key for one record or one document */
export const newDataKey = (): Buffer => randomBytes(KEY_BYTES)

export type WrappedKey = { keyId: string; wrappedKey: string }

/** Encrypts a data key under the current master key. `context` binds it to its owner. */
export const wrapDataKey = (dataKey: Buffer, context: string): WrappedKey => {
  const { current } = masterKeys()
  const { iv, ciphertext, tag } = encrypt(current.key, dataKey, `kyc-key:${context}`)
  return { keyId: current.id, wrappedKey: [FORMAT, b64(iv), b64(ciphertext), b64(tag)].join('.') }
}

/** Recovers a data key, with whichever master key (current or previous) wrapped it */
export const unwrapDataKey = ({ keyId, wrappedKey }: WrappedKey, context: string): Buffer => {
  const { current, previous } = masterKeys()
  const master = [current, previous].find((k) => k?.id === keyId)
  if (!master)
    throw new KycCryptoError('This KYC record was encrypted with a key that is not configured')
  const [format, iv, ciphertext, tag] = wrappedKey.split('.')
  if (format !== FORMAT || !iv || !ciphertext || !tag)
    throw new KycCryptoError('A KYC key is malformed')
  const key = decrypt(master.key, unb64(iv), unb64(ciphertext), unb64(tag), `kyc-key:${context}`)
  if (key.length !== KEY_BYTES) throw new KycCryptoError('A KYC key is malformed')
  return key
}

/** Re-wraps a data key under the current master key (for rotation). The data is untouched. */
export const rewrapDataKey = (wrapped: WrappedKey, context: string): WrappedKey =>
  wrapDataKey(unwrapDataKey(wrapped, context), context)

/* ─── Fields ────────────────────────────────────────────────────────────── */

/** Encrypts one field. `context` says whose and which field, e.g. "member:12:pan". */
export const sealField = (dataKey: Buffer, plaintext: string, context: string): string => {
  const { iv, ciphertext, tag } = encrypt(
    dataKey,
    Buffer.from(plaintext, 'utf8'),
    `kyc-field:${context}`,
  )
  return [FORMAT, b64(iv), b64(ciphertext), b64(tag)].join('.')
}

export const openField = (dataKey: Buffer, sealed: string, context: string): string => {
  const [format, iv, ciphertext, tag] = sealed.split('.')
  if (format !== FORMAT || !iv || !ciphertext || !tag)
    throw new KycCryptoError('A KYC value is malformed')
  return decrypt(
    dataKey,
    unb64(iv),
    unb64(ciphertext),
    unb64(tag),
    `kyc-field:${context}`,
  ).toString('utf8')
}

/* ─── Files ─────────────────────────────────────────────────────────────── */

/** Encrypts a whole file: [iv | ciphertext | tag], bound to its context */
export const sealFile = (dataKey: Buffer, bytes: Buffer, context: string): Buffer => {
  const { iv, ciphertext, tag } = encrypt(dataKey, bytes, `kyc-file:${context}`)
  return Buffer.concat([Buffer.from(FORMAT), iv, ciphertext, tag])
}

export const openFile = (dataKey: Buffer, sealed: Buffer, context: string): Buffer => {
  const head = FORMAT.length
  if (
    sealed.length < head + IV_BYTES + TAG_BYTES ||
    sealed.subarray(0, head).toString() !== FORMAT
  ) {
    throw new KycCryptoError('A KYC file is malformed')
  }
  const iv = sealed.subarray(head, head + IV_BYTES)
  const tag = sealed.subarray(sealed.length - TAG_BYTES)
  const ciphertext = sealed.subarray(head + IV_BYTES, sealed.length - TAG_BYTES)
  return decrypt(dataKey, iv, ciphertext, tag, `kyc-file:${context}`)
}

/* ─── Blind indexes ─────────────────────────────────────────────────────── */

const normalisers = {
  pan: (v: string) => v.replace(/\s+/g, '').toUpperCase(),
  account: (v: string) => v.replace(/\D/g, ''),
  // "k7q 4mx" is the code K7Q-4MX
  'identity-code': (v: string) => v.replace(/[^a-z0-9]/gi, '').toUpperCase(),
  // A name and a date of birth, "Asha Rao|1990-01-31", however the name is spaced or cased
  identity: (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase(),
} as const

/** Equal for equal values, unrelated otherwise, meaningless without KYC_BLIND_INDEX_KEY */
export const blindIndex = (kind: keyof typeof normalisers, value: string): string =>
  createHmac('sha256', blindKey())
    .update(`${kind}:${normalisers[kind](value)}`)
    .digest('hex')
