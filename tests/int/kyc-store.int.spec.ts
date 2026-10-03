// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteEncrypted,
  KycStoreError,
  kycPrefix,
  readEncrypted,
  storeEncrypted,
} from '@/kyc/documentStore'

// No OIDC token unless a test supplies one. (Locally, the real function would fetch one through
// the Vercel CLI, and the test would reach Vercel.)
const oidc = vi.hoisted(() => ({ token: null as string | null }))
vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: async () => {
    if (!oidc.token) throw new Error('no token')
    return oidc.token
  },
}))

/*
 * Where KYC documents may go. Store IDs and tokens here are made up; nothing reaches Vercel,
 * because every refusal happens before a request would be made.
 */

const saved = { ...process.env }
let env: Record<string, string | undefined>
beforeEach(() => {
  env = process.env as Record<string, string | undefined>
  oidc.token = null
  delete env.KYC_STORE_ID
  delete env.BLOB_STORE_ID
  delete env.VERCEL_OIDC_TOKEN
  delete env.VERCEL_ENV
})
afterEach(() => {
  process.env = { ...saved }
})

describe('the KYC document store', () => {
  it('keeps each environment in its own folder', () => {
    env.VERCEL_ENV = 'production'
    expect(kycPrefix()).toBe('kyc/')
    env.VERCEL_ENV = 'preview'
    expect(kycPrefix()).toBe('preview/kyc/')
    delete env.VERCEL_ENV
    expect(kycPrefix()).toBe('development/kyc/')
  })

  it('will not read or delete another environment’s documents', async () => {
    env.VERCEL_ENV = 'preview'
    await expect(readEncrypted('kyc/abc.bin')).rejects.toThrow(KycStoreError)
    await expect(deleteEncrypted('kyc/abc.bin')).rejects.toThrow(KycStoreError)
    await expect(deleteEncrypted('preview/kyc/../../kyc/abc.bin')).rejects.toThrow(KycStoreError)
  })

  it('never falls back to the public store’s credentials', async () => {
    // A public read-write token is present, as it is on Vercel, but no OIDC token: refuse
    env.KYC_STORE_ID = 'store_exampleKycNotReal'
    env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_examplemedia_notreal'
    env.BLOB_STORE_ID = 'store_exampleMediaNotReal'
    await expect(storeEncrypted('abc.bin', Buffer.from('ciphertext'))).rejects.toThrow(
      /cannot be reached/,
    )
  })

  it('refuses a KYC store ID that is really the public media store', async () => {
    env.KYC_STORE_ID = 'store_exampleMediaNotReal'
    env.BLOB_STORE_ID = 'store_EXAMPLEMEDIANOTREAL'
    oidc.token = 'example.oidc.token'
    await expect(storeEncrypted('abc.bin', Buffer.from('ciphertext'))).rejects.toThrow(
      /public media store/,
    )
  })
})
