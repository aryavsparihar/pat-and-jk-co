/**
 * Cloudflare Turnstile, checked on the server: the code request (signing in, and the start of both
 * applications) and the public forms. The browser earns a token from the widget; this asks
 * Cloudflare (siteverify) whether it is genuine, unused and unexpired, was earned on the same form
 * (the action), and on the same site the request came to (the hostname). Cloudflare spends a token
 * the first time it is verified and refuses it after five minutes, so a token works once.
 *
 * Only where TURNSTILE_SECRET_KEY is set (production and previews). Without it, on a developer's
 * machine and in the tests, the check is skipped, as the widget is without its site key.
 *
 * If Cloudflare cannot be reached, the request is let through and the reason logged: an outage of
 * theirs should not close the applications, and the honeypot, the form-start token and the rate
 * limits still stand in front of every one of these forms.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** The name the token travels under: in a JSON body, or as a public form's submission entry */
export const TURNSTILE_FIELD = 'cf-turnstile-response'

/** What a refused person is told: nothing was sent, the likely cause, and what to do */
export const TURNSTILE_REFUSED =
  'We could not confirm this came from a person, so nothing was sent. If you use Brave Shields or a privacy extension, allow challenges.cloudflare.com for this site, then try again.'

/** One per form, so a token earned on one cannot be spent on another */
export type TurnstileAction = 'signin' | 'apply-artist' | 'apply-partner' | 'contact'

/**
 * Cloudflare's published test secrets (always pass, always fail, already spent). Their answers
 * carry placeholders in place of the form's action and the hostname, so neither can be compared; previews
 * use them, production never does
 */
export const TURNSTILE_TEST_SECRET = /^[123]x0+AA$/
/** And their test site keys (visible and invisible widgets): always pass, block, or challenge */
export const TURNSTILE_TEST_SITE_KEY = /^[123]x0+[A-F]{2}$/

/** The site a request came to, as Cloudflare reports it: no port, lower case */
export const requestHostname = (headers: Headers | null | undefined): string | null => {
  const host = headers?.get('x-forwarded-host') ?? headers?.get('host')
  return host ? host.split(',')[0]!.trim().toLowerCase().replace(/:\d+$/, '') : null
}

export type TurnstileResult =
  { ok: true; checked: boolean; note?: string } | { ok: false; reason: string }

export const turnstileEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.TURNSTILE_SECRET_KEY?.trim())

export const verifyTurnstile = async (
  token: unknown,
  action: TurnstileAction,
  {
    env = process.env,
    fetchImpl = fetch,
    hostname,
  }: {
    env?: NodeJS.ProcessEnv
    fetchImpl?: typeof fetch
    /** The site the request came to (requestHostname); the token must have been earned there */
    hostname?: string | null
  } = {},
): Promise<TurnstileResult> => {
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return { ok: true, checked: false }
  // Tokens are at most 2048 characters
  if (typeof token !== 'string' || !token || token.length > 2048) {
    return { ok: false, reason: 'missing' }
  }

  let outcome: { success?: boolean; action?: string; hostname?: string; 'error-codes'?: string[] }
  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return { ok: true, checked: false, note: `unreachable: ${response.status}` }
    outcome = await response.json()
  } catch (error) {
    return { ok: true, checked: false, note: `unreachable: ${(error as Error).name}` }
  }

  if (!outcome.success) {
    return { ok: false, reason: (outcome['error-codes'] ?? []).join(',') || 'not-genuine' }
  }
  // Cloudflare's test secrets answer with placeholders for both, so neither can be compared there
  if (TURNSTILE_TEST_SECRET.test(secret)) return { ok: true, checked: true }
  if (outcome.action !== action) return { ok: false, reason: 'wrong-form' }
  if (hostname && outcome.hostname?.toLowerCase() !== hostname.toLowerCase())
    return { ok: false, reason: 'wrong-site' }
  return { ok: true, checked: true }
}
