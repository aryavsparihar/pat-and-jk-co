/** Internal route segment that holds every brand's pages: /tenant-sites/<host>/… */
export const TENANT_SITES_PREFIX = '/tenant-sites'

/** Lowercases a Host header and strips the port: "PJK.co.in:443" → "pjk.co.in". */
export const normalizeHost = (host?: string | null): string => {
  const value = (host ?? '').split(',')[0]!.trim().toLowerCase()
  return value.replace(/:\d+$/, '') || 'localhost'
}
