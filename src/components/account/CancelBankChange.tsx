'use client'

import React, { useState } from 'react'

import { api } from '../onboarding/api'

export const CancelBankChange: React.FC<{ token: string }> = ({ token }) => {
  const [state, setState] = useState<'ready' | 'busy' | 'done' | 'failed'>('ready')
  const [message, setMessage] = useState<string | null>(null)

  if (!token) {
    return (
      <p className="measure">
        This link is incomplete. Please use the link in the email exactly as it is.
      </p>
    )
  }

  if (state === 'done') {
    return (
      <div className="measure grid gap-y-4" role="status">
        <p>The change has been stopped. Your bank details stay as they were.</p>
        <p>
          We have signed the account out everywhere and told our team, who will be in touch. When
          you next sign in, you will be sent a fresh code by email.
        </p>
      </div>
    )
  }

  const stop = async () => {
    setState('busy')
    const result = await api('/next/members/kyc/bank-change/cancel', { body: { token } })
    if (result.ok) return setState('done')
    setMessage(result.data.message ?? 'That did not work. Please write to us.')
    setState('failed')
  }

  return (
    <div className="measure grid gap-y-6">
      <p>
        Stopping it keeps your current bank details in place, signs your account out on every
        device, and tells our team.
      </p>
      {message && (
        <p className="text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}
      <div>
        <button
          className="btn btn-solid min-h-11"
          disabled={state === 'busy'}
          onClick={stop}
          type="button"
        >
          {state === 'busy' ? 'Stopping…' : 'Stop the change'}
        </button>
      </div>
    </div>
  )
}
