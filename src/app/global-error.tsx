'use client'

import React from 'react'

/**
 * The last resort, when even the page's layout failed: a bare page of its own, with no styles to
 * load and nothing from the error shown but Next's reference for it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          padding: '12vh 7vw',
          background: '#f6f3ec',
          color: '#16201a',
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <p style={{ letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 13 }}>
          PAT and J.K. Co.
        </p>
        <h1 style={{ fontWeight: 400, fontSize: 'clamp(2rem, 5vw, 3rem)', maxWidth: '18ch' }}>
          The site could not be shown just now.
        </h1>
        <p style={{ fontSize: 19, maxWidth: '36rem', lineHeight: 1.6 }}>
          The fault is on our side. Please try again in a moment. If it keeps happening, write to
          hello@pjk.co.in{error.digest ? ` and quote ${error.digest}` : ''}.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 24,
            padding: '12px 22px',
            background: '#0f2a18',
            color: '#f6f3ec',
            border: 0,
            fontFamily: 'inherit',
            fontSize: 16,
            cursor: 'pointer',
          }}
          type="button"
        >
          Try again
        </button>
      </body>
    </html>
  )
}
