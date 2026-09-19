/** Internal route segment that holds every brand's pages: /tenant-sites/<host>/… */
export const TENANT_SITES_PREFIX = '/tenant-sites'

/**
 * A hostname and nothing else: letters, digits, dots and hyphens, in labels of 1–63 characters
 * that neither start nor end with a hyphen.
 *
 * The Host header is supplied by the caller and is interpolated into the internal rewrite path,
 * so a value containing a slash or a dot segment could steer a request at a route it was never
 * meant to reach — including the admin panel, which the gate in `proxy.ts` has already waved
 * through by that point.
 */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/

/**
 * Lowercases a Host header and strips the port: "PJK.co.in:443" → "pjk.co.in".
 * Anything that is not a plain hostname falls back to "localhost", which resolves to the
 * default brand rather than to whatever the caller asked for.
 */
export const normalizeHost = (host?: string | null): string => {
  const value = (host ?? '').split(',')[0]!.trim().toLowerCase().replace(/:\d+$/, '')
  return HOSTNAME.test(value) ? value : 'localhost'
}
