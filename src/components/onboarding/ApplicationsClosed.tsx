import React from 'react'

/** What the application pages say while applications are closed (Site settings → Applications) */
export const ApplicationsClosed: React.FC<{ note: string }> = ({ note }) => (
  <div className="border-t border-border-strong pt-8">
    <p className="lede measure whitespace-pre-line">{note}</p>
    <p className="muted mt-6">
      Already have an account?{' '}
      <a className="link" href="/collaborate/signin">
        Sign in
      </a>
      .
    </p>
  </div>
)
