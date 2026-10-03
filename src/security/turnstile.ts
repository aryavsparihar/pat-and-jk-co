/**
 * Cloudflare Turnstile, checked on the server: the code request (signing in, and the start of both
 * applications) and the public forms. The browser earns a token from the widget; this asks
 * Cloudflare whether it is genuine, unused, and was earned on the same form.
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

/** One per form, so a token earned on one cannot be spent on another */
export type TurnstileAction = 'signin' | 'apply-artist' | 'apply-partner' | 'contact'

/**
 * Cloudflare's published test secrets (always pass, always fail, already spent). Their answers
 * carry a placeholder in place of the form's action, so the action cannot be compared; previews
 * use them, production never does
 */
const TEST_SECRET = /^[123]x0+AA$/

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
  }: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<TurnstileResult> => {
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return { ok: true, checked: false }
  // Tokens are at most 2048 characters
  if (typeof token !== 'string' || !token || token.length > 2048) {
    return { ok: false, reason: 'missing' }
  }

  let outcome: { success?: boolean; action?: string; 'error-codes'?: string[] }
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
  if (outcome.action !== action && !TEST_SECRET.test(secret))
    return { ok: false, reason: 'wrong-form' }
  return { ok: true, checked: true }
}
