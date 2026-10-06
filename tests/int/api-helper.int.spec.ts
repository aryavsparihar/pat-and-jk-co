import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, OFFLINE_MESSAGE, TIMEOUT_MESSAGE } from '@/components/onboarding/api'

/*
 * The browser's helper for every account and application form. A save that could not be sent,
 * or never got an answer, used to leave the button saying "Saving…" for ever: the error was
 * thrown past the code that resets it. Now every request ends, with a message to show.
 */
afterEach(() => vi.unstubAllGlobals())

describe('a request from the account and application forms', () => {
  it('that cannot be sent comes back as a failure with a message, not an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const result = await api('/next/members/application/step', { body: { step: 'address' } })
    expect(result).toEqual({ ok: false, status: 0, data: { message: OFFLINE_MESSAGE } })
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
