'use client'

import React, { useEffect, useRef, useState } from 'react'

import { api } from '@/components/onboarding/api'
import { Sending } from '@/components/onboarding/Sending'

const formFor = (kind: 'artist' | 'partner') =>
  kind === 'artist' ? '/collaborate/artists' : '/collaborate/partners'

/**
 * "Apply again": starts a new application, with the earlier answers carried over, and opens it.
 * After a decline once the wait is over, or after a withdrawal.
 */
export const ApplyAgainButton: React.FC<{ kind: 'artist' | 'partner' }> = ({ kind }) => {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setMessage(null)
    const result = await api('/next/members/application/reapply', { body: { type: kind } })
    if (!result.ok) {
      setBusy(false)
      return setMessage(
        result.data.message ?? 'That could not be done just now. Please try again later.',
      )
    }
    window.location.assign(formFor(kind))
  }

  return (
    <>
      <button
        className="btn btn-solid min-h-11"
        disabled={busy}
        onClick={() => void start()}
        type="button"
      >
        {busy ? <Sending label="Starting" /> : 'Apply again'}
      </button>
      {message && (
        <p className="mt-4 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}
    </>
  )
}

/**
 * "Withdraw this application", with a dialog over the page that says plainly what happens, so
 * nobody withdraws by accident. Reloads the page once done, which then shows it withdrawn.
 */
export const WithdrawButton: React.FC<{ kind: 'artist' | 'partner'; reference: string }> = ({
  kind,
  reference,
}) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="link link-caps min-h-11" onClick={() => setOpen(true)} type="button">
        Withdraw this application<span className="sr-only"> ({reference})</span>
      </button>
      {open && (
        <WithdrawDialog
          draft={false}
          kind={kind}
          onClose={() => setOpen(false)}
          reference={reference}
        />
      )}
    </>
  )
}

/** "Delete this draft": an application not yet sent goes altogether, after a plain question */
export const DeleteDraftButton: React.FC<{ kind: 'artist' | 'partner'; reference: string }> = ({
  kind,
  reference,
}) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="link link-caps min-h-11" onClick={() => setOpen(true)} type="button">
        Delete this draft<span className="sr-only"> ({reference})</span>
      </button>
      {open && (
        <WithdrawDialog draft kind={kind} onClose={() => setOpen(false)} reference={reference} />
      )}
    </>
  )
}

const WithdrawDialog: React.FC<{
  kind: 'artist' | 'partner'
  reference: string
  draft: boolean
  onClose: () => void
}> = ({ kind, reference, draft, onClose }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  const withdraw = async () => {
    setBusy(true)
    setMessage(null)
    const result = await api(
      draft ? '/next/members/application/delete-draft' : '/next/members/application/withdraw',
      { body: { type: kind } },
    )
    if (!result.ok) {
      setBusy(false)
      return setMessage(
        result.data.message ?? 'That could not be done just now. Please try again later.',
      )
    }
    window.location.reload()
  }

  return (
    <dialog
      aria-labelledby="withdraw-title"
      className="privacy-dialog m-auto w-[min(100%-2rem,32rem)] bg-background p-6 text-[var(--text)] sm:p-8"
      onCancel={onClose}
      ref={dialog}
    >
      <h2 className="display-sm" id="withdraw-title">
        {draft ? `Delete draft ${reference}?` : `Withdraw application ${reference}?`}
      </h2>
      <p className="measure mt-3">
        {draft
          ? 'Everything you have filled in, and any pictures you added, are deleted. This cannot be undone. You can start a new application whenever you like.'
          : 'We will stop considering it, and it stays on record as withdrawn. You can start a new application whenever you like, with your other answers filled in.'}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
        <button
          className="btn btn-solid min-h-11"
          disabled={busy}
          onClick={() => void withdraw()}
          type="button"
        >
          {busy ? (
            <Sending label={draft ? 'Deleting' : 'Withdrawing'} />
          ) : draft ? (
            'Delete it'
          ) : (
            'Withdraw it'
          )}
        </button>
        <button className="link link-caps min-h-11" onClick={onClose} type="button">
          Keep it
        </button>
      </div>
      {message && (
        <p className="mt-4 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}
    </dialog>
  )
}
