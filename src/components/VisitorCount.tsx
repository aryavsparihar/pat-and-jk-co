'use client'

import React, { useEffect, useState } from 'react'

const SESSION_KEY = 'pjk-counted'

/** Guards against the double effect run in development, which would count one visit twice. */
let asked = false

/**
 * The running visit total at the foot of the site.
 *
 * Pages are cached static HTML, so the number is fetched once the page is open rather than
 * rendered with it. The first page a browser opens counts the visit; everything after that in
 * the same session only reads the total, so moving around the site does not inflate it.
 *
 * Nothing renders until a number arrives, and nothing renders at all if the request fails —
 * a counter is not worth an error message in the footer.
 */
export const VisitorCount: React.FC = () => {
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    if (asked) return
    asked = true

    let counted = false
    try {
      counted = window.sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      // Private browsing can refuse session storage; count the visit and move on
    }

    fetch('/next/visits', { method: counted ? 'GET' : 'POST' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: number } | null) => {
        if (typeof data?.total !== 'number') return
        setTotal(data.total)
        try {
          window.sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          // as above
        }
      })
      .catch(() => {
        // The site reads perfectly well without a visit count
      })
  }, [])

  if (total === null) return null

  // The separator belongs to the number, so the copyright line is never left with a stray dot
  return (
    <>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <p>
        {total.toLocaleString('en-GB')} {total === 1 ? 'visit' : 'visits'}
      </p>
    </>
  )
}
