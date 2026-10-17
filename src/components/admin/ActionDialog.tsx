'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

export type DialogRequest = {
  title: string
  /** What will happen, in a sentence or two */
  description?: string
  /** The button that goes ahead, e.g. "Reveal" or "Approve" */
  confirmLabel: string
  /** Ask for a reason, which the server records in the security log */
  reason?: { label: string; hint?: string }
  /** Ask for a date (YYYY-MM-DD); empty is allowed when optional */
  date?: { label: string; initial?: string; optional?: boolean; hint?: string }
  /** Ask for an email address */
  email?: { label: string; hint?: string }
  /** A box that must be ticked before going ahead, e.g. that a check has been done */
  attest?: { label: string }
  /** Text that must be typed exactly, e.g. the ID of the person being deleted */
  typed?: { label: string; expect: string }
  /** A red button, for something hard to undo */
  danger?: boolean
}

export type DialogAnswer = { reason: string; date: string; email: string; typed: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const MIN_REASON = 10

/**
 * An in-page dialog in the admin's style, in place of the browser's prompt() and confirm(): a
 * title, what will happen, a required reason when one is asked for, Cancel, and the action.
 * Esc cancels, focus starts in the first field and returns where it was, and the action stays
 * disabled until the reason is long enough (the server checks it again).
 *
 *   const { dialog, ask } = useActionDialog()
 *   const answer = await ask({ title: 'Reveal full details', confirmLabel: 'Reveal', reason: {...} })
 *   if (!answer) return   // cancelled
 */
export const useActionDialog = () => {
  const [request, setRequest] = useState<DialogRequest | null>(null)
  const resolver = useRef<((answer: DialogAnswer | null) => void) | null>(null)

  const ask = useCallback(
    (next: DialogRequest) =>
      new Promise<DialogAnswer | null>((resolve) => {
        resolver.current = resolve
        setRequest(next)
      }),
    [],
  )

  const finish = useCallback((answer: DialogAnswer | null) => {
    resolver.current?.(answer)
    resolver.current = null
    setRequest(null)
  }, [])

  const dialog = request ? <ActionDialog onFinish={finish} request={request} /> : null
  return { dialog, ask }
}

const ActionDialog: React.FC<{
  request: DialogRequest
  onFinish: (answer: DialogAnswer | null) => void
}> = ({ request, onFinish }) => {
  const ref = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<Element | null>(null)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(request.date?.initial ?? '')
  const [email, setEmail] = useState('')
  const [attested, setAttested] = useState(false)
  const [typed, setTyped] = useState('')
  const ids = {
    typed: useId(),
    title: useId(),
    description: useId(),
    reason: useId(),
    date: useId(),
    email: useId(),
    attest: useId(),
  }

  useEffect(() => {
    returnFocus.current = document.activeElement
    ref.current?.showModal()
    const restore = returnFocus.current
    return () => {
      if (restore instanceof HTMLElement) restore.focus()
    }
  }, [])

  const reasonOk = !request.reason || reason.trim().length >= MIN_REASON
  const dateOk =
    !request.date ||
    (request.date.optional && date.trim() === '') ||
    /^\d{4}-\d{2}-\d{2}$/.test(date.trim())
  const emailOk = !request.email || EMAIL.test(email.trim())
  const typedOk =
    !request.typed || typed.trim().toUpperCase() === request.typed.expect.toUpperCase()
  const ready = reasonOk && dateOk && emailOk && typedOk && (!request.attest || attested)

  // Not a <form>: Payload renders the sidebar inside its own document form, and forms cannot nest
  const submit = () => {
    if (!ready) return
    onFinish({ reason: reason.trim(), date: date.trim(), email: email.trim(), typed: typed.trim() })
  }

  return (
    <dialog
      aria-describedby={request.description ? ids.description : undefined}
      aria-labelledby={ids.title}
      className="pjk-action-dialog"
      // Esc fires "cancel": treat it as Cancel
      onCancel={(event) => {
        event.preventDefault()
        onFinish(null)
      }}
      ref={ref}
    >
      <div>
        <h2 id={ids.title} style={{ margin: '0 0 0.75rem' }}>
          {request.title}
        </h2>
        {request.description && (
          <p id={ids.description} style={{ margin: '0 0 1.25rem', opacity: 0.85 }}>
            {request.description}
          </p>
        )}

        {request.date && (
          <div className="field-type text" style={{ marginBottom: '1rem' }}>
            <label className="field-label" htmlFor={ids.date}>
              {request.date.label}
              {!request.date.optional && <span className="required">*</span>}
            </label>
            <input
              aria-describedby={request.date.hint ? `${ids.date}-hint` : undefined}
              autoFocus
              id={ids.date}
              onChange={(e) => setDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="YYYY-MM-DD"
              type="text"
              value={date}
            />
            {request.date.hint && (
              <p id={`${ids.date}-hint`} style={{ opacity: 0.7, marginTop: '0.25rem' }}>
                {request.date.hint}
              </p>
            )}
          </div>
        )}

        {request.email && (
          <div className="field-type email" style={{ marginBottom: '1rem' }}>
            <label className="field-label" htmlFor={ids.email}>
              {request.email.label}
              <span className="required">*</span>
            </label>
            <input
              aria-describedby={request.email.hint ? `${ids.email}-hint` : undefined}
              autoFocus={!request.date}
              id={ids.email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              value={email}
            />
            {request.email.hint && (
              <p id={`${ids.email}-hint`} style={{ opacity: 0.7, marginTop: '0.25rem' }}>
                {request.email.hint}
              </p>
            )}
          </div>
        )}

        {request.reason && (
          <div className="field-type textarea" style={{ marginBottom: '1rem' }}>
            <label className="field-label" htmlFor={ids.reason}>
              {request.reason.label}
              <span className="required">*</span>
            </label>
            <textarea
              aria-describedby={`${ids.reason}-hint`}
              aria-required
              autoFocus={!request.date && !request.email}
              id={ids.reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              style={{ width: '100%' }}
              value={reason}
            />
            <p id={`${ids.reason}-hint`} style={{ opacity: 0.7, marginTop: '0.25rem' }}>
              {request.reason.hint ??
                'A few words at least. It is recorded in the security log with your name.'}
            </p>
          </div>
        )}

        {request.typed && (
          <div className="field-type text" style={{ marginBottom: '1rem' }}>
            <label className="field-label" htmlFor={ids.typed}>
              {request.typed.label}
              <span className="required">*</span>
            </label>
            <input
              aria-describedby={`${ids.typed}-hint`}
              aria-required
              autoComplete="off"
              id={ids.typed}
              onChange={(e) => setTyped(e.target.value)}
              spellCheck={false}
              type="text"
              value={typed}
            />
            <p id={`${ids.typed}-hint`} style={{ opacity: 0.7, marginTop: '0.25rem' }}>
              Type <strong>{request.typed.expect}</strong> exactly.
            </p>
          </div>
        )}

        {request.attest && (
          <label
            htmlFor={ids.attest}
            style={{
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start',
              marginBottom: '1rem',
            }}
          >
            <input
              checked={attested}
              id={ids.attest}
              onChange={(e) => setAttested(e.target.checked)}
              style={{ marginTop: '0.3rem' }}
              type="checkbox"
            />
            <span>{request.attest.label}</span>
          </label>
        )}

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem',
          }}
        >
          <button
            autoFocus={!request.reason && !request.date && !request.email}
            className="btn btn--style-secondary btn--size-medium"
            onClick={() => onFinish(null)}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`btn btn--size-medium ${request.danger ? 'pjk-btn-danger' : 'btn--style-primary'}`}
            disabled={!ready}
            onClick={submit}
            style={ready ? undefined : { opacity: 0.45, cursor: 'not-allowed' }}
            type="button"
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
