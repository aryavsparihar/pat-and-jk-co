// @vitest-environment node
import { generateKeyPairSync, webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  artistChallengeId,
  jwks,
  parseArtistChallengeId,
  signingPayload,
  signRequest,
  signToken,
  verifySignature,
} from '@/phulhaar/protocol'

const secret = 'a'.repeat(64)
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()

const signed = (body: string, timestamp: number, path = '/next/phulhaar/sign-in/request') =>
  signRequest(secret, signingPayload({ timestamp, method: 'POST', path, body }))

describe('Phulhaar request signatures', () => {
  const now = 1_800_000_000
  const body = JSON.stringify({ artistId: 'AT000123' })
  const check = (overrides: Partial<Parameters<typeof verifySignature>[0]> = {}) =>
    verifySignature({
      secret,
      timestamp: String(now),
      signature: signed(body, now),
      method: 'POST',
      path: '/next/phulhaar/sign-in/request',
      body,
      now,
      ...overrides,
    })

  it('accepts a genuine, recent request', () => {
    expect(check()).toBe(true)
  })

  it('refuses a changed body, another path, an old clock or a missing signature', () => {
    expect(check({ body: JSON.stringify({ artistId: 'AT000124' }) })).toBe(false)
    expect(check({ path: '/next/phulhaar/sign-in/verify' })).toBe(false)
    expect(check({ now: now + 301 })).toBe(false)
    expect(check({ signature: null })).toBe(false)
    expect(check({ signature: 'f'.repeat(64) })).toBe(false)
  })

  it('matches the line Phulhaar signs', () => {
    expect(signingPayload({ timestamp: 1, method: 'post', path: '/p', body: '' })).toBe(
      'v1.1.POST./p.e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
})

describe('Phulhaar tokens', () => {
  it('verify against the published key, the way Phulhaar checks them', async () => {
    const token = signToken({ artistId: 'AT000123', standing: 'active' }, pem, 1_800_000_000)
    const [header, payload, signature] = token.split('.')
    const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())

    const [jwk] = jwks(pem).keys
    expect(decode(header)).toMatchObject({ alg: 'RS256', kid: jwk.kid })
    const key = await webcrypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const valid = await webcrypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      Buffer.from(signature, 'base64url'),
      new TextEncoder().encode(`${header}.${payload}`),
    )
    expect(valid).toBe(true)
    expect(decode(payload)).toMatchObject({
      iss: 'https://pjk.co.in',
      aud: 'phulhaar',
      exp: 1_800_000_120,
      artistId: 'AT000123',
    })
  })

  it('never carries more of the key than the public half', () => {
    const [jwk] = jwks(pem).keys
    expect(Object.keys(jwk).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use'])
  })
})

describe('artist challenge ids', () => {
  it('carry the challenge and the ID typed, and nothing else parses', () => {
    expect(parseArtistChallengeId(artistChallengeId(42, 'PT000001'))).toEqual({
      id: 42,
      memberId: 'PT000001',
    })
    expect(parseArtistChallengeId('42')).toBeNull()
    expect(parseArtistChallengeId('42.XX000001')).toBeNull()
    expect(parseArtistChallengeId(42)).toBeNull()
  })
})
