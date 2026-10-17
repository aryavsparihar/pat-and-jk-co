import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
  uploadWithProgress,
} from '@/components/onboarding/api'

/*
 * The browser's helper for every account and application form. A save that could not be sent,
 * or never got an answer, used to leave the button saying "Saving…" for ever: the error was
 * thrown past the code that resets it. Now every request ends, with a message to show, and one
 * dropped on the way is tried again where repeating it is safe.
 */
afterEach(() => vi.unstubAllGlobals())

describe('a request from the account and application forms', () => {
  it('that is dropped is tried again, and goes through when the connection comes back', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++
        if (calls === 1) throw new TypeError('Failed to fetch')
        return Response.json({ completedSteps: ['about', 'address'] })
      }),
    )
    const result = await api('/next/members/application/step', { body: { step: 'address' } })
    expect(calls).toBe(2)
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { completedSteps: ['about', 'address'] },
    })
  })

  it('that cannot be sent at all comes back as a failure with a message, not an error', async () => {
    const dropped = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', dropped)
    const result = await api('/next/members/application/step', { body: { step: 'address' } })
    // The first try and two more
    expect(dropped).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ ok: false, status: 0, data: { message: OFFLINE_MESSAGE } })
  })

  it('is never sent twice where once is all it may be: a code, the application, an upload', async () => {
    const dropped = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', dropped)
    await api('/next/members/verify-code', { body: { code: '123456' } })
    await api('/next/members/application/submit', { body: {} })
    const form = new FormData()
    form.append('file', new Blob(['x']), 'work.jpg')
    await api('/next/members/portfolio', { body: form })
    expect(dropped).toHaveBeenCalledTimes(3)
  })

  it('that gets no answer is given up on in time, with a message', async () => {
    // A server that never answers: the request ends only when it is aborted
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason)),
          ),
      ),
    )
    const result = await api('/next/members/application/step', {
      body: { step: 'address' },
      timeoutMs: 50,
    })
    expect(result).toEqual({ ok: false, status: 0, data: { message: TIMEOUT_MESSAGE } })
    // The server may still be finishing it: not sent again
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('still passes on what the server says', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ message: 'A few things need another look.' }, { status: 422 }),
      ),
    )
    const result = await api('/next/members/application/step', { body: { step: 'address' } })
    expect(result).toEqual({
      ok: false,
      status: 422,
      data: { message: 'A few things need another look.' },
    })
  })
})

/** What the browser makes of one attempt, taken in the order the attempts are made */
type Attempt =
  | { fails: 'before any bytes go' }
  | { fails: 'after some bytes have gone' }
  | { fails: 'by being given up on' }
  | { answers: number; body?: string }

const someBytes = (loaded: number) =>
  ({ lengthComputable: true, loaded, total: 1000 }) as unknown as ProgressEvent

/**
 * Stands in for the browser's XMLHttpRequest, as far as the upload helper uses it, so each attempt
 * can be made to fail in its own way. The array that comes back holds every attempt actually sent.
 */
const uploadsThat = (attempts: Attempt[]) => {
  const made: FormData[] = []
  class FakeRequest {
    status = 0
    responseText = ''
    timeout = 0
    withCredentials = false
    upload: {
      onprogress: ((event: ProgressEvent) => void) | null
      onload: (() => void) | null
    } = { onprogress: null, onload: null }
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    onload: (() => void) | null = null
    open() {
      // The helper only needs it to be there
    }
    send(form: FormData) {
      const attempt = attempts[made.length]
      made.push(form)
      setTimeout(() => {
        // An attempt the test did not describe is left hanging, as a request with no answer would
        // be: a helper that sent one too many never finishes, and the test says so
        if (!attempt) return
        if ('answers' in attempt) {
          this.status = attempt.answers
          this.responseText = attempt.body ?? '{}'
          this.upload.onprogress?.(someBytes(1000))
          this.upload.onload?.()
          return this.onload?.()
        }
        if (attempt.fails === 'after some bytes have gone') this.upload.onprogress?.(someBytes(400))
        if (attempt.fails === 'by being given up on') return this.onabort?.()
        this.onerror?.()
      })
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeRequest)
  return made
}

const onePicture = () => {
  const form = new FormData()
  form.append('file', new Blob(['a picture']), 'picture.jpg')
  return form
}

describe('a picture on its way to the server', () => {
  it('that got nowhere is sent again, and goes through on the second attempt', async () => {
    const made = uploadsThat([
      { fails: 'before any bytes go' },
      { answers: 201, body: '{"image":{"id":7}}' },
    ])
    const result = await uploadWithProgress<{ image: { id: number } }>(
      '/next/members/portfolio',
      onePicture(),
      () => {},
    )
    expect(made).toHaveLength(2)
    expect(result).toEqual({ ok: true, status: 201, data: { image: { id: 7 } } })
  })

  it('that had begun to go is not sent again, so no artist ends up with it twice', async () => {
    const made = uploadsThat([{ fails: 'after some bytes have gone' }, { answers: 201 }])
    const result = await uploadWithProgress('/next/members/portfolio', onePicture(), () => {})
    expect(made).toHaveLength(1)
    expect(result).toEqual({ ok: false, status: 0, data: { message: OFFLINE_MESSAGE } })
  })

  it('that the browser gives up on still answers, instead of leaving the form waiting', async () => {
    const made = uploadsThat([{ fails: 'by being given up on' }])
    const result = await uploadWithProgress('/next/members/portfolio', onePicture(), () => {})
    expect(made).toHaveLength(1)
    expect(result).toEqual({ ok: false, status: 0, data: { message: OFFLINE_MESSAGE } })
  })
})
