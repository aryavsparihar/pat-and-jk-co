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
  /** A red button, for something hard to undo */
  danger?: boolean
}

export type DialogAnswer = { reason: string; date: string }

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
  const ids = { title: useId(), description: useId(), reason: useId(), date: useId() }

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
  const ready = reasonOk && dateOk

  // Not a <form>: Payload renders the sidebar inside its own document form, and forms cannot nest
  const submit = () => {
    if (!ready) return
    onFinish({ reason: reason.trim(), date: date.trim() })
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

        {request.reason && (
          <div className="field-type textarea" style={{ marginBottom: '1rem' }}>
            <label className="field-label" htmlFor={ids.reason}>
              {request.reason.label}
              <span className="required">*</span>
            </label>
            <textarea
              aria-describedby={`${ids.reason}-hint`}
              aria-required
              autoFocus={!request.date}
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

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '1.5rem',
          }}
        >
          <button
            autoFocus={!request.reason && !request.date}
            className="btn btn--style-secondary btn--size-medium"
            onClick={() => onFinish(null)}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`btn btn--size-medium ${request.danger ? 'btn--style-error' : 'btn--style-primary'}`}
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
