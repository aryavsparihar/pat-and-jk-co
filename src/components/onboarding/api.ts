/** JSON to and from the member endpoints, same-origin with the session cookie */
export type ApiResult<T = Record<string, unknown>> = {
  ok: boolean
  status: number
  data: T & { message?: string; errors?: Record<string, string> }
}

/**
 * How long a request may take before the person is told. Uploads get longer: a picture on a slow
 * mobile connection can take a while, and that is not a failure.
 */
const TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

export const OFFLINE_MESSAGE =
  'We could not reach PJK just now, so this was not saved. Check your connection, then try again: what you typed is still here.'
export const TIMEOUT_MESSAGE =
  'That took too long, so it may not have been saved. Check your connection, then try again: what you typed is still here.'

/**
 * Requests that must never be sent twice: a one-time code is used up by the first, a second
 * application send or a second bank change would confuse, and a second upload adds a duplicate
 * picture. Everything else (reading, saving a step, saving details) is safe to repeat: saving the
 * same thing twice leaves the same result.
 */
const ONCE_ONLY = [
  '/next/members/request-code',
  '/next/members/verify-code',
  '/next/members/step-up',
  '/next/members/application/start',
  '/next/members/application/submit',
  '/next/members/application/partner',
  '/next/members/kyc/bank-change',
  '/next/members/portal/email',
  '/next/members/data-request',
  '/next/members/sign-out',
]

/** Pauses before each retry: long enough for a dropped connection to come back */
const RETRY_DELAYS_MS = [800, 2000]

/**
 * Never throws and never waits for ever. A request that cannot be sent (a dropped connection, a
 * blocked request) is tried again, twice, where that is safe; one that still fails, or gets no
 * answer in time, comes back as a failure with a message the form can show, so a button can never
 * be left saying "Saving…" with nothing happening. A timeout is not retried: the server may still
 * be finishing the first attempt.
 */
export const api = async <T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<ApiResult<T>> => {
  const upload = init.body instanceof FormData
  const request: RequestInit = {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: upload ? undefined : { 'Content-Type': 'application/json' },
    body: upload
      ? (init.body as FormData)
      : init.body === undefined
        ? undefined
        : JSON.stringify(init.body),
  }
  const timeoutMs = init.timeoutMs ?? (upload ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS)
  const path = url.split('?')[0]!
  const retries = upload || ONCE_ONLY.some((p) => path.startsWith(p)) ? 0 : RETRY_DELAYS_MS.length

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { ...request, signal: AbortSignal.timeout(timeoutMs) })
      const data = (await response.json().catch(() => ({}))) as ApiResult<T>['data']
      return { ok: response.ok, status: response.status, data }
    } catch (error) {
      const timedOut = (error as Error)?.name === 'TimeoutError'
      if (!timedOut && attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        continue
      }
      return {
        ok: false,
        status: 0,
        data: { message: timedOut ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE } as ApiResult<T>['data'],
      }
    }
  }
}
