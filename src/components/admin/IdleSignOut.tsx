'use client'

import { useAuth } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { AFK_LIMIT_MINUTES } from '@/components/session/afk'
import { useAfkSignOut } from '@/components/session/useAfkSignOut'
import { pingSessionTabs, readSessionHint, writeSessionHint } from '@/utilities/sessionHint'

/**
 * "Still there?" in the admin panel: the same fifteen-minute limit as the site, in the panel's own
 * style (src/components/session/afk.ts for the clock, and why there is one).
 *
 * It matters most here. A staff session ends thirty minutes after its last use, but the panel
 * refreshes its own token while it is open, so a dashboard left on a screen stayed signed in all
 * day. Signing out is Payload's own logout, which clears the session cookie; the gate cookie is
 * left alone, as a password is still asked for on the way back in.
 */
export const IdleSignOut: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { logOut, user } = useAuth()
  const [leaving, setLeaving] = useState(false)

  const signOut = useCallback(async () => {
    setLeaving(true)
    try {
      await logOut()
    } finally {
      // The site's own tabs are told the staff session has gone, then the panel is left for the
      // sign-in page by a full page load, so nothing it held stays in memory
      if (readSessionHint(document.cookie) === 'staff') writeSessionHint(null)
      pingSessionTabs()
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/admin/login')
    }
  }, [logOut])

  const { secondsLeft, stay } = useAfkSignOut({
    enabled: Boolean(user),
    onLimit: () => void signOut(),
  })

  return (
    <>
      {children}
      {user && secondsLeft !== null && (
        <IdleDialog
          leaving={leaving}
          onSignOut={() => void signOut()}
          onStay={stay}
          secondsLeft={secondsLeft}
        />
      )}
    </>
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
      className="pjk-action-dialog"
      // Esc is somebody plainly there, so it means stay rather than cancel
      onCancel={(event) => {
        event.preventDefault()
        onStay()
      }}
      ref={dialog}
    >
      <div>
        <h2 id="afk-title" style={{ margin: '0 0 0.75rem' }}>
          Still there?
        </h2>
        <p id="afk-what-happens" style={{ margin: 0, opacity: 0.85 }}>
          {leaving
            ? 'Signing you out…'
            : `The panel has not been used for ${AFK_LIMIT_MINUTES} minutes. To keep the records safe, you will be signed out in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}.`}
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem',
          }}
        >
          <button
            className="btn btn--style-secondary btn--size-medium"
            disabled={leaving}
            onClick={onSignOut}
            type="button"
          >
            Sign out now
          </button>
          <button
            autoFocus
            className="btn btn--style-primary btn--size-medium"
            disabled={leaving}
            onClick={onStay}
            type="button"
          >
            Stay signed in
          </button>
        </div>
      </div>
    </dialog>
  )
}
