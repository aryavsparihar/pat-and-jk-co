import React from 'react'

import type { BotCheckProblem } from './useTurnstile'

/**
 * What a form says when the Turnstile check could not run or did not pass: that nothing was sent,
 * the likely cause, and what to do, with a way to reach us that needs no check at all. With an
 * email address (the contact form has the brand's), it is given; otherwise the contact page.
 */
export const BotCheckHelp: React.FC<{
  problem: BotCheckProblem
  email?: string | null
  id?: string
}> = ({ problem, email, id }) => (
  <div className="mt-6 border-l-2 border-destructive pl-5 text-base" id={id} role="alert">
    <p className="font-medium">
      {problem === 'blocked'
        ? 'The security check could not load, so nothing was sent.'
        : 'The security check did not go through, so nothing was sent.'}
    </p>
    <p className="measure mt-2">
      Brave Shields and some privacy or ad-blocking extensions can stop it. Allow
      challenges.cloudflare.com, or turn the shield off for pjk.co.in, then try again.
    </p>
    <p className="measure mt-2">
      If it still does not work,{' '}
      {email ? (
        <>
          write to us at{' '}
          <a className="link" href={`mailto:${email}`}>
            {email}
          </a>
          .
        </>
      ) : (
        <>
          you will find our email addresses on the{' '}
          <a className="link" href="/contact">
            Contact page
          </a>
          .
        </>
      )}
    </p>
  </div>
)
