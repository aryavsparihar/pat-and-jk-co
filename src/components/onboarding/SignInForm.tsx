'use client'

import React from 'react'

import { CodeSignIn } from './CodeSignIn'

/** Signs a member in and takes them to their account */
export const SignInForm: React.FC<{ formToken: string; next?: string }> = ({
  formToken,
  next = '/account',
}) => (
  <CodeSignIn
    formToken={formToken}
    // A full page load on purpose, so the account page is rendered with the new session
    onSignedIn={() => window.location.assign(next)}
    purpose="signin"
  />
)
