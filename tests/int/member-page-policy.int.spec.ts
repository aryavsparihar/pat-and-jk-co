// @vitest-environment node
import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'
import { CAMERA_PERMISSIONS, memberPagePolicy } from '@/security/memberPagePolicy'

/*
 * The member pages' security policy: Google's map hosts only where the map is (the artist
 * application, with a key), the camera and location only there too, and the two places that set
 * the artist page's Permissions-Policy saying the same thing.
 */

describe('the member pages’ policy', () => {
  it('lets Google’s map in only when asked, and never as a script host', () => {
    const plain = memberPagePolicy('n0nce')
    const maps = memberPagePolicy('n0nce', { maps: true })
    expect(plain).not.toMatch(/google/)
    expect(maps).toMatch(/img-src [^;]*https:\/\/\*\.googleapis\.com/)
    expect(maps).toMatch(/connect-src [^;]*https:\/\/\*\.googleapis\.com/)
    expect(maps).toMatch(/frame-src [^;]*https:\/\/\*\.google\.com/)
    // Scripts still run only with the page's nonce; Google's loads because the app's code adds it
    const script = maps.split('; ').find((d) => d.startsWith('script-src'))!
    expect(script).not.toMatch(/google/)
    expect(script).not.toMatch(/unsafe-eval/)
  })

  it('allows the camera and location on the artist application only, the same in both places', async () => {
    expect(CAMERA_PERMISSIONS).toMatch(/camera=\(self\)/)
    expect(CAMERA_PERMISSIONS).toMatch(/geolocation=\(self\)/)
    const rules = (await nextConfig.headers!()) as {
      source: string
      headers: { key: string; value: string }[]
    }[]
    const permissions = (source: string) =>
      rules.find((r) => r.source === source)?.headers.find((h) => h.key === 'Permissions-Policy')
        ?.value
    expect(permissions('/collaborate/artists')).toBe(CAMERA_PERMISSIONS)
    const everywhere = rules
      .flatMap((r) => r.headers)
      .filter((h) => h.key === 'Permissions-Policy' && h.value !== CAMERA_PERMISSIONS)
    for (const header of everywhere) {
      expect(header.value).toMatch(/camera=\(\)/)
      expect(header.value).toMatch(/geolocation=\(\)/)
    }
  })
})
