/** JSON to and from the member endpoints, same-origin with the session cookie */
export type ApiResult<T = Record<string, unknown>> = {
  ok: boolean
  status: number
  data: T & { message?: string; errors?: Record<string, string> }
}

export const api = async <T = Record<string, unknown>>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> => {
  const response = await fetch(url, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: init.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body:
      init.body instanceof FormData
        ? init.body
        : init.body === undefined
          ? undefined
          : JSON.stringify(init.body),
  })
  const data = (await response.json().catch(() => ({}))) as ApiResult<T>['data']
  return { ok: response.ok, status: response.status, data }
}
