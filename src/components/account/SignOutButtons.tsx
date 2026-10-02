'use client'

import React, { useState } from 'react'

import { api } from '../onboarding/api'

/** Sign out here, or everywhere at once (every device this account is signed in on) */
export const SignOutButtons: React.FC = () => {
  const [busy, setBusy] = useState(false)
  const leave = async (everywhere: boolean) => {
    setBusy(true)
    await api(everywhere ? '/next/members/sign-out-everywhere' : '/next/members/sign-out', {
      body: {},
    })
    // A full page load on purpose: nothing from the signed-in page should survive in memory
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/collaborate/signin')
  }
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <button
        className="btn btn-outline min-h-11"
        disabled={busy}
        onClick={() => leave(false)}
        type="button"
      >
        Sign out
      </button>
      <button
        className="link link-caps min-h-11"
        disabled={busy}
        onClick={() => leave(true)}
        type="button"
      >
        Sign out on every device
      </button>
    </div>
  )
}
