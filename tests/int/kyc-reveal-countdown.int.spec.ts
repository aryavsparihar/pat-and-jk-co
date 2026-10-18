import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, test, vi } from 'vitest'

import { type Reveal, revealLeft, useReveal } from '@/components/admin/reveal'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/*
 * The minute a reveal of an artist's full PAN, Aadhaar and bank details lasts in the admin sidebar,
 * as the panel counts it down. The panel used to count a second per `setInterval` tick, so the
 * minute lasted as long as the browser cared to run the timer: a tab in the background has its
 * timers slowed to about one a minute, which made the minute an hour, and a tab the browser had
 * frozen or kept to come back to fired none at all, so the values stayed on screen until someone
 * closed the page. The dialog and docs/KYC.md both promise one minute. It is now measured on the
 * device's own clock from when the values arrived, and checked again whenever the page is looked at.
 */

const SECOND = 1000
const arrived = 1_760_000_000_000
const pan = 'ABCDE1234F'

const reveal = (seconds?: number): Reveal => ({ values: { pan }, seconds, gotAt: arrived })

describe('what a reveal has left', () => {
  test('a minute from when the values arrived, then nothing', () => {
    expect(revealLeft(reveal(60), arrived)).toBe(60 * SECOND)
    expect(revealLeft(reveal(60), arrived + 20 * SECOND)).toBe(40 * SECOND)
    expect(revealLeft(reveal(60), arrived + 60 * SECOND)).toBe(0)
    expect(revealLeft(reveal(60), arrived + 30 * 60 * SECOND)).toBeLessThan(0)
  })

  test('never longer than a minute, whatever the reply says, and a minute when it says nothing', () => {
    expect(revealLeft(reveal(3600), arrived)).toBe(60 * SECOND)
    expect(revealLeft(reveal(undefined), arrived)).toBe(60 * SECOND)
    expect(revealLeft(reveal(10), arrived + 10 * SECOND)).toBe(0)
  })
})

/** The sidebar in miniature: the button that reveals, then the values and their countdown */
const Panel: React.FC = () => {
  const { values, left, show, hide } = useReveal()
  return values
    ? React.createElement(
        'div',
        null,
        React.createElement('dd', null, values.pan),
        React.createElement('p', null, `Hidden again in ${left} s.`),
        React.createElement('button', { onClick: hide, type: 'button' }, 'Hide now'),
      )
    : React.createElement(
        'button',
        { onClick: () => show({ pan }, 60), type: 'button' },
        'Reveal full details',
      )
}

const mount = async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(React.createElement(Panel))
  })
  const press = async () =>
    act(async () => {
      host.querySelector('button')?.click()
    })
  await press()
  return {
    host,
    press,
    says: () => host.textContent ?? '',
    close: async () => {
      await act(async () => root.unmount())
      host.remove()
    },
  }
}

describe('the revealed values in the panel', () => {
  test('go when the minute is up, counted in time and not in ticks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(arrived)
    const panel = await mount()
    expect(panel.says()).toContain(pan)
    expect(panel.says()).toContain('Hidden again in 60 s.')

    await act(async () => vi.advanceTimersByTime(30 * SECOND))
    expect(panel.says()).toContain('Hidden again in 30 s.')

    await act(async () => vi.advanceTimersByTime(30 * SECOND))
    expect(panel.says()).not.toContain(pan)
    expect(panel.says()).toContain('Reveal full details')

    await panel.close()
    vi.useRealTimers()
  })

  test('are gone the moment a tab whose timers were frozen is looked at again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(arrived)
    const panel = await mount()
    expect(panel.says()).toContain(pan)

    // Ten minutes pass with the tab frozen: time moves on, no timer fires
    vi.setSystemTime(arrived + 10 * 60 * SECOND)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(panel.says()).not.toContain(pan)

    await panel.close()
    vi.useRealTimers()
  })

  test('are gone on a return by focus or pageshow too, and on "Hide now"', async () => {
    vi.useFakeTimers()
    for (const back of [
      () => window.dispatchEvent(new Event('focus')),
      () => window.dispatchEvent(new Event('pageshow')),
    ]) {
      vi.setSystemTime(arrived)
      const panel = await mount()
      expect(panel.says()).toContain(pan)
      vi.setSystemTime(arrived + 61 * SECOND)
      await act(async () => {
        back()
      })
      expect(panel.says()).not.toContain(pan)
      await panel.close()
    }

    vi.setSystemTime(arrived)
    const panel = await mount()
    await panel.press()
    expect(panel.says()).not.toContain(pan)

    // Nothing left running once the panel is gone
    await panel.close()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})
