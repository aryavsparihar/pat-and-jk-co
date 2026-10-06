import React from 'react'

/**
 * The artist application while applications are closed, in Phulhaar's identity: the note from
 * Site settings → Applications, set in the display face under a gold rule, and what to have ready
 * for when they open. It arrives gently, as a step of the form does, and stays still for anyone
 * who prefers less motion.
 */

const READY = [
  'A few photographs of recent work: sharp, well lit, the whole piece in frame.',
  'Your PAN, and a masked e-Aadhaar or another ID that shows your address.',
]

export const PhulhaarClosed: React.FC<{ note: string }> = ({ note }) => (
  <section
    aria-labelledby="opening-soon"
    className="step-in border border-[color-mix(in_oklab,var(--gold)_35%,transparent)] border-t-2 border-t-[var(--gold)] bg-surface p-7 sm:p-10"
  >
    <p className="label" id="opening-soon" style={{ color: 'var(--gold-text)' }}>
      Opening soon
    </p>
    <p className="display-sm mt-4 max-w-[26ch] whitespace-pre-line">{note}</p>

    <div className="mt-10 border-t border-[color-mix(in_oklab,var(--gold)_30%,transparent)] pt-8">
      <h2 className="label">While you wait</h2>
      <ul className="mt-5 grid gap-4">
        {READY.map((line) => (
          <li className="measure flex gap-4" key={line}>
            <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rotate-45 bg-[var(--gold)]" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>

    <p className="muted mt-10">
      Already have an account?{' '}
      <a className="link" href="/collaborate/signin">
        Sign in
      </a>
      .
    </p>
  </section>
)
