import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test, vi } from 'vitest'

import {
  type Code,
  codeLeft,
  IdentityCode,
} from '@/components/onboarding/artist/identity/IdentityCode'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/*
 * The ten minutes an identity code lasts, as the page counts them down. The page used to take the
 * server's expiry away from the device's own "now" and clamp the answer at ten minutes, so a
 * device clock behind the server's froze the countdown at "Valid for 10:00" — for half an hour, if
 * someone left the page open that long — while the server had long stopped taking the code. A
 * clock ahead of the server's said the code had run out the moment it arrived. It is measured on
 * the one clock that can measure it: the device's, from when the code reached it.
 */

const MINUTE = 60_000
const arrived = 1_760_000_000_000

const code = (minutes?: number): Code => ({ code: 'K7Q-4MX', minutes, gotAt: arrived })

describe('what an identity code has left', () => {
  test('ten minutes from when it arrived, then nothing', () => {
    expect(codeLeft(code(10), arrived)).toBe(10 * MINUTE)
    expect(codeLeft(code(10), arrived + 4 * MINUTE)).toBe(6 * MINUTE)
    expect(codeLeft(code(10), arrived + 10 * MINUTE)).toBe(0)
    expect(codeLeft(code(10), arrived + 30 * MINUTE)).toBeLessThan(0)
  })

  test("the same however far the device clock is from the server's, since neither is compared", () => {
    for (const skew of [-30 * MINUTE, 0, 30 * MINUTE]) {
      const theirs = { ...code(10), gotAt: arrived + skew }
      expect(codeLeft(theirs, theirs.gotAt + 4 * MINUTE)).toBe(6 * MINUTE)
      expect(codeLeft(theirs, theirs.gotAt + 10 * MINUTE)).toBe(0)
    }
  })

  test('never longer than ten minutes, whatever the reply says, and ten when it says nothing', () => {
    expect(codeLeft(code(600), arrived)).toBe(10 * MINUTE)
    expect(codeLeft(code(undefined), arrived)).toBe(10 * MINUTE)
    expect(codeLeft(code(2), arrived + 2 * MINUTE)).toBe(0)
  })
})

/*
 * The other way the countdown used to stick at "Valid for 10:00": a tab in the background has its
 * timers slowed to about one a minute, and a frozen one has none at all, so what it last painted
 * is what someone sees when they come back to it.
 */
test('a tab whose timers were frozen catches up the moment it is looked at again', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(arrived)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(React.createElement(IdentityCode, { busy: false, code: code(10), onNew: () => {} }))
  })
  const says = () =>
    /Valid for \d+:\d\d|This code has run out\./.exec(host.textContent ?? '')?.[0] ?? '(nothing)'
  expect(says()).toBe('Valid for 10:00')

  // Seven minutes pass with the tab frozen: time moves on, no timer fires
  vi.setSystemTime(arrived + 7 * MINUTE)
  expect(says()).toBe('Valid for 10:00')
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(says()).toBe('Valid for 3:00')

  vi.setSystemTime(arrived + 31 * MINUTE)
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(says()).toBe('This code has run out.')

  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
})
