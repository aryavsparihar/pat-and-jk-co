'use client'

/**
 * Loads Google's Maps JavaScript API once, when the artist first opens the map, and never before.
 * The script tag is added by this code, which the page's nonce trusts, so the member pages'
 * policy needs no script host for it (src/security/memberPagePolicy.ts).
 */

let loading: Promise<void> | null = null

type GoogleWindow = Record<string, unknown> & { google?: { maps?: { importLibrary?: unknown } } }

const CALLBACK = '__pjkGoogleMapsReady'

export const loadGoogleMaps = (key: string): Promise<void> => {
  const w = window as unknown as GoogleWindow
  if (w.google?.maps?.importLibrary) return Promise.resolve()
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    w[CALLBACK] = () => resolve()
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key,
      v: 'weekly',
      loading: 'async',
      libraries: 'maps,marker,places,geocoding',
      callback: CALLBACK,
      region: 'IN',
      language: 'en-IN',
    })}`
    script.async = true
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Google Maps could not load'))
    }
    document.head.append(script)
  })
  return loading
}

/**
 * Google calls this when the key is refused (wrong site, API not enabled, quota used up). The map
 * then falls back to OpenStreetMap's.
 */
export const onGoogleMapsRefused = (handler: () => void) => {
  ;(window as unknown as GoogleWindow).gm_authFailure = handler
}
