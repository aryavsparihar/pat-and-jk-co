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
 * Never throws and never waits for ever. A request that cannot be sent (no connection, a blocked
 * request) or gets no answer in time comes back as a failure with a message the form can show,
 * so a button can never be left saying "Saving…" with nothing happening.
 */
export const api = async <T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<ApiResult<T>> => {
  const upload = init.body instanceof FormData
  try {
    const response = await fetch(url, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: upload ? undefined : { 'Content-Type': 'application/json' },
      body: upload
        ? (init.body as FormData)
        : init.body === undefined
          ? undefined
          : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? (upload ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS)),
    })
    const data = (await response.json().catch(() => ({}))) as ApiResult<T>['data']
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    const timedOut = (error as Error)?.name === 'TimeoutError'
    return {
      ok: false,
      status: 0,
      data: { message: timedOut ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE } as ApiResult<T>['data'],
    }
  }
}
