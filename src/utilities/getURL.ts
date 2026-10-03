import canUseDOM from './canUseDOM'

type Env = Record<string, string | undefined>

const withHttps = (host: string | undefined) => {
  const h = host
    ?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  return h ? `https://${h}` : undefined
}

const normalise = (origin: string) => origin.trim().replace(/\/+$/, '')

/**
 * On a Vercel *Preview* deployment only, the addresses Vercel gives it: the branch alias
 * (VERCEL_BRANCH_URL) first, then the deployment's own URL (VERCEL_URL). Anywhere else, none:
 * production sets VERCEL_URL too, and must never trust its *.vercel.app address.
 */
export const previewDeploymentURLs = (env: Env = process.env): string[] =>
  env.VERCEL_ENV === 'preview'
    ? [env.VERCEL_BRANCH_URL, env.VERCEL_URL].map(withHttps).filter((u): u is string => Boolean(u))
    : []

/**
 * The site's own address, for links in emails, canonical URLs and the like. A preview links to
 * itself, so a code or a link it emails leads back to the preview, not to the live site.
 */
export const getServerSideURL = (env: Env = process.env): string =>
  previewDeploymentURLs(env)[0] ||
  env.NEXT_PUBLIC_SERVER_URL ||
  (env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

/**
 * Origins allowed to send cookie-authenticated requests: Payload's CSRF and CORS lists and the
 * member endpoints' Origin check all use this one list. Production: the site's URL
 * (https://pjk.co.in) and ALLOWED_ORIGINS. A preview: its own URLs and ALLOWED_ORIGINS.
 */
export const trustedOrigins = (env: Env = process.env): string[] => [
  ...new Set(
    [
      getServerSideURL(env),
      ...previewDeploymentURLs(env),
      ...(env.ALLOWED_ORIGINS?.split(',') ?? []),
    ]
      .map(normalise)
      .filter(Boolean),
  ),
]

export const getClientSideURL = () => {
  if (canUseDOM) {
    const protocol = window.location.protocol
    const domain = window.location.hostname
    const port = window.location.port

    return `${protocol}//${domain}${port ? `:${port}` : ''}`
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  return process.env.NEXT_PUBLIC_SERVER_URL || ''
}
