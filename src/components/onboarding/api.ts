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
  '/next/members/application/reapply',
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

/** A dropped upload is tried again after this long, where trying again is safe */
const UPLOAD_RETRY_DELAY_MS = 800

/** One attempt, and whether any of the picture had gone when it failed */
type Attempt<T> = { reply: ApiResult<T>; nothingSent: boolean }

const sendOnce = <T>(
  url: string,
  form: FormData,
  onProgress: (fraction: number | null) => void,
  onSent?: () => void,
): Promise<Attempt<T>> =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    /** How much of the picture the browser says has gone */
    let sent = 0
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.timeout = UPLOAD_TIMEOUT_MS
    // A fraction only when the browser knows the total; otherwise null, and no number is shown
    xhr.upload.onprogress = (event) => {
      sent = event.loaded
      onProgress(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null)
    }
    xhr.upload.onload = () => onSent?.()
    const fail = (message: string, nothingSent = false) =>
      resolve({
        reply: { ok: false, status: 0, data: { message } as ApiResult<T>['data'] },
        nothingSent,
      })
    xhr.onerror = () => fail(OFFLINE_MESSAGE, sent === 0)
    xhr.ontimeout = () => fail(TIMEOUT_MESSAGE)
    // Nothing here calls abort, but a browser does when it tidies up a page that is going away;
    // a form that hears nothing back would wait for ever
    xhr.onabort = () => fail(OFFLINE_MESSAGE)
    xhr.onload = () => {
      let data = {} as ApiResult<T>['data']
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        // Not JSON: the status speaks for itself
      }
      resolve({
        reply: { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data },
        nothingSent: false,
      })
    }
    xhr.send(form)
  })

/**
 * Sends a file as a form, telling `onProgress` how much has gone (0 to 1). fetch cannot report
 * upload progress, so this uses XMLHttpRequest; like `api`, it never throws and never waits for
 * ever.
 *
 * An attempt that failed before a single byte of the picture had gone is made once more: the
 * server cannot have kept a picture it was never sent, so no duplicate can follow. That is how a
 * connection the browser believed was still open fails — a browser keeps one to hand and may find
 * it closed at the other end — and it is the one upload failure worth repeating. Once bytes have
 * gone it is never repeated: the picture may have arrived in full, with only the reply lost.
 */
export const uploadWithProgress = async <T = Record<string, unknown>>(
  url: string,
  form: FormData,
  onProgress: (fraction: number | null) => void,
  /** Every byte has gone; the server is now working on it, until the reply */
  onSent?: () => void,
): Promise<ApiResult<T>> => {
  const first = await sendOnce<T>(url, form, onProgress, onSent)
  if (!first.nothingSent) return first.reply
  await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS))
  return (await sendOnce<T>(url, form, onProgress, onSent)).reply
}
