import { json, jwks, phulhaarConfig } from '@/phulhaar/protocol'

export const dynamic = 'force-dynamic'

/** The public key Phulhaar verifies PJK's sign-in tokens with. Public by design. */
export function GET() {
  const config = phulhaarConfig()
  if (!config) return json({ keys: [] }, 404)
  return json(jwks(config.signingKey), 200, { 'Cache-Control': 'public, max-age=300' })
}
