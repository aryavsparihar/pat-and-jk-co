import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

/**
 * The Phulhaar Gallery sign-in protocol, PJK's half (phulhaar-gallery docs/PJK-INTEGRATION.md).
 *
 * Phulhaar signs every request with a shared secret (HMAC-SHA256 over the timestamp, method, path
 * and body digest), and PJK answers a correct code with a two-minute RS256 token that Phulhaar
 * checks against the public key published at /.well-known/jwks.json. PJK is the identity
 * provider: Phulhaar learns an Artist ID, a display name and a standing, and nothing else.
 */

/** How far a request's clock may drift before its signature is refused, in seconds. */
export const SIGNATURE_WINDOW_SECONDS = 300
/** Every request is a small JSON object; anything larger is refused before it is parsed. */
export const MAX_BODY_BYTES = 4096
/** Short-lived on purpose: Phulhaar exchanges it at once for its own session and never stores it. */
export const TOKEN_TTL_SECONDS = 120

export const ISSUER = 'https://pjk.co.in'
export const AUDIENCE = 'phulhaar'

export type PhulhaarConfig = { sharedSecret: string; signingKey: string }

/** Both settings, or null: half a configuration must not look like a working one. */
export const phulhaarConfig = (): PhulhaarConfig | null => {
  const sharedSecret = process.env.PHULHAAR_SHARED_SECRET?.trim()
  // Vercel's dashboard keeps a pasted PEM's line breaks, but a one-line "\n" form works too
  const signingKey = process.env.PHULHAAR_SIGNING_KEY?.replace(/\\n/g, '\n').trim()
  return sharedSecret && signingKey ? { sharedSecret, signingKey } : null
}

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** The line both sides sign: `v1.{timestamp}.{METHOD}.{path}.{sha256 hex of the body}`. */
export const signingPayload = ({
  timestamp,
  method,
  path,
  body,
}: {
  timestamp: number
  method: string
  path: string
  body: string
}) => `v1.${timestamp}.${method.toUpperCase()}.${path}.${sha256Hex(body)}`

export const signRequest = (secret: string, line: string) =>
  createHmac('sha256', secret).update(line, 'utf8').digest('hex')

/** Whether a request's signature is genuine and recent. Compared in constant time. */
export const verifySignature = ({
  secret,
  timestamp,
  signature,
  method,
  path,
  body,
  now = Math.floor(Date.now() / 1000),
}: {
  secret: string
  timestamp: string | null
  signature: string | null
  method: string
  path: string
  body: string
  now?: number
}): boolean => {
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return false
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false
  const ts = Number(timestamp)
  if (Math.abs(now - ts) > SIGNATURE_WINDOW_SECONDS) return false
  const expected = signRequest(secret, signingPayload({ timestamp: ts, method, path, body }))
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}

/** Read and check a signed request from Phulhaar, or the reply to send instead. */
export const readSigned = async <T extends object>(
  request: Request,
  config: PhulhaarConfig,
): Promise<{ ok: true; body: Partial<T> } | { ok: false; response: Response }> => {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: json({ code: 'body_too_large' }, 413) }
  }
  const body = await request.text()
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, response: json({ code: 'body_too_large' }, 413) }
  }
  const genuine = verifySignature({
    secret: config.sharedSecret,
    timestamp: request.headers.get('x-phulhaar-timestamp'),
    signature: request.headers.get('x-phulhaar-signature'),
    method: request.method,
    path: new URL(request.url).pathname,
    body,
  })
  if (!genuine) return { ok: false, response: json({ code: 'bad_signature' }, 401) }
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('not an object')
    return { ok: true, body: parsed as Partial<T> }
  } catch {
    return { ok: false, response: json({ code: 'malformed_json' }, 400) }
  }
}

/** The key id: a fingerprint of the public key, so a rotated key gets a new id by itself. */
export const keyId = (signingKey: string) =>
  base64url(
    createHash('sha256')
      .update(createPublicKey(createPrivateKey(signingKey)).export({ format: 'der', type: 'spki' }))
      .digest(),
  ).slice(0, 16)

/** An RS256 token for Phulhaar: issuer, audience, two-minute expiry, a unique id, and the claims. */
export const signToken = (
  claims: Record<string, unknown>,
  signingKey: string,
  now = Math.floor(Date.now() / 1000),
): string => {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId(signingKey) }))
  const payload = base64url(
    JSON.stringify({
      iss: ISSUER,
      aud: AUDIENCE,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
      jti: randomUUID(),
      ...claims,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  return `${header}.${payload}.${base64url(signer.sign(createPrivateKey(signingKey)))}`
}

/** The public half, as the JSON Web Key Set Phulhaar fetches. */
export const jwks = (signingKey: string) => {
  const jwk = createPublicKey(createPrivateKey(signingKey)).export({ format: 'jwk' }) as {
    n: string
    e: string
  }
  return {
    keys: [{ kty: 'RSA', alg: 'RS256', use: 'sig', kid: keyId(signingKey), n: jwk.n, e: jwk.e }],
  }
}

/**
 * The challenge id Phulhaar holds between the two steps: PJK's challenge number and the ID the
 * artist typed. The ID is carried rather than looked up again because one member may hold both
 * an artist and a partner ID; it is checked against the member at verification, so changing it
 * gains nothing.
 */
export const artistChallengeId = (id: number, memberId: string) => `${id}.${memberId}`

export const parseArtistChallengeId = (value: unknown): { id: number; memberId: string } | null => {
  const match = typeof value === 'string' ? /^(\d{1,12})\.((?:AT|PT)\d{6,})$/.exec(value) : null
  return match ? { id: Number(match[1]), memberId: match[2] } : null
}
