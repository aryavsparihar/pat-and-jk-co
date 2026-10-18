'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { AFK_LIMIT_MINUTES } from './afk'
import { useAfkSignOut } from './useAfkSignOut'
import { announceSessionChange, refreshSession, useSession } from './sessionStore'

/**
 * "Still there?" on every page of the site: the dialog a minute before a signed-in browser that
 * nobody has touched is signed out, and the sign-out itself when nobody answers. The clock, and
 * why there is one, is in src/components/session/afk.ts; the admin panel has its own
 * dialog in its own style (src/components/admin/IdleSignOut.tsx).
 *
 * Nothing is rendered and no listener is added unless somebody is signed in, which on a public
 * page is almost nobody (src/components/session/sessionStore.ts).
 */
export const IdleSignOut: React.FC = () => {
  const session = useSession()
  const signedIn = session === 'member' || session === 'staff'
  const [leaving, setLeaving] = useState(false)

  const signOut = useCallback(async () => {
    setLeaving(true)
    try {
      await fetch(session === 'staff' ? '/api/users/logout' : '/next/members/sign-out', {
        body: '{}',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    } finally {
      // Every other open tab updates too; then a full page load, so nothing the page held about
      // the account stays in memory. A member is told why they are back at the sign-in page;
      // staff sign in at /admin, so they go to the front page
      announceSessionChange()
      window.location.assign(session === 'staff' ? '/' : '/collaborate/signin?from=idle')
    }
  }, [session])

  const { secondsLeft, stay } = useAfkSignOut({
    enabled: signedIn,
    onLimit: () => void signOut(),
  })

  // Staying is also worth a word with the server: it keeps the session itself from running out,
  // and if it has already gone the header says so at once instead of this asking again
  const keepGoing = () => {
    stay()
    void refreshSession()
  }

  if (!signedIn || secondsLeft === null) return null
  return (
    <IdleDialog
      leaving={leaving}
      onSignOut={() => void signOut()}
      onStay={keepGoing}
      secondsLeft={secondsLeft}
    />
  )
}

const IdleDialog: React.FC<{
  leaving: boolean
  onSignOut: () => void
  onStay: () => void
  secondsLeft: number
}> = ({ leaving, onSignOut, onStay, secondsLeft }) => {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  return (
    <dialog
      aria-describedby="afk-what-happens"
      aria-labelledby="afk-title"
      className="privacy-dialog m-auto w-[min(100%-2rem,32rem)] bg-background p-6 text-[var(--text)] sm:p-8"
      // Esc is somebody plainly there, so it means stay rather than cancel
      onCancel={(event) => {
        event.preventDefault()
        onStay()
      }}
      ref={dialog}
    >
      <h2 className="display-sm" id="afk-title">
        Still there?
      </h2>
      <p className="measure mt-3" id="afk-what-happens">
        {leaving ? (
          'Signing you out…'
        ) : (
          <>
            This page has not been used for {AFK_LIMIT_MINUTES} minutes. To keep your account safe,
            we will sign you out in {secondsLeft} second{secondsLeft === 1 ? '' : 's'}.
          </>
        )}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <button
          autoFocus
          className="btn btn-solid min-h-11"
          disabled={leaving}
          onClick={onStay}
          type="button"
        >
          Stay signed in
        </button>
        <button
          className="link link-caps min-h-11"
          disabled={leaving}
          onClick={onSignOut}
          type="button"
        >
          Sign out now
        </button>
      </div>
    </dialog>
  )
}
