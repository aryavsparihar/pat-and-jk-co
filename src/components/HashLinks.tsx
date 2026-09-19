'use client'

import React, { useEffect } from 'react'

/**
 * Makes links to a section of the current page work every time.
 *
 * A link to `#form` on the page you are already on only scrolls once: after that the hash has
 * not changed, so the browser has no fragment to jump to and the router has no new URL to
 * navigate to, and the click does nothing. The openings on the Collaborate page all point at
 * the same form, so this was easy to hit.
 *
 * Handling the click here scrolls every time. `scrollIntoView` honours the `scroll-margin-top`
 * on sections, so the heading lands below the sticky header rather than behind it.
 */
export const HashLinks: React.FC = () => {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Leave anything the page already handled, and every way of opening a link elsewhere
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as Element | null)?.closest('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      if (!anchor.getAttribute('href')?.includes('#')) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname !== window.location.pathname) return

      const id = decodeURIComponent(url.hash.slice(1))
      const target = id && document.getElementById(id)
      if (!target) return

      // Taken over completely. Stopping the event here is what keeps the router out of it:
      // it would otherwise navigate to the URL it is already on, and scroll nowhere.
      event.preventDefault()
      event.stopPropagation()
      if (url.hash !== window.location.hash) window.history.pushState(null, '', url.hash)

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

      // Move the keyboard to the section as a real fragment jump would
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    }

    // Capture phase: React delivers its own click handlers at the root container, below
    // document, and next/link calls preventDefault() there. Listening on the way down means
    // this runs first and can decide.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
