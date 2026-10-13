'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

import { api, type ApiResult } from './api'
import { fieldClass } from './fields'
import { Sending } from './Sending'

/**
 * "Confirm it is you": sensitive actions need a sign-in within the last 30 minutes
 * (src/members/recent.ts). When the server says so (403 with `stepUp`), this asks for a fresh code
 * by email, in a dialog over the page, and then runs the request again. Nothing typed on the page
 * is lost while it is open.
 */

type Guard = <T>(run: () => Promise<ApiResult<T>>) => Promise<ApiResult<T>>

const StepUpContext = createContext<{ guard: Guard; confirm: () => Promise<boolean> } | null>(null)

export const needsStepUp = (result: ApiResult<unknown>) =>
  result.status === 403 && Boolean((result.data as { stepUp?: boolean }).stepUp)

export const StepUpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false)
  const settle = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        settle.current = resolve
        setOpen(true)
      }),
    [],
  )

  const guard = useCallback<Guard>(
    async (run) => {
      const first = await run()
      if (!needsStepUp(first)) return first
      return (await confirm()) ? run() : first
    },
    [confirm],
  )

  const done = (ok: boolean) => {
    setOpen(false)
    settle.current?.(ok)
    settle.current = null
  }

  return (
    <StepUpContext.Provider value={{ guard, confirm }}>
      {children}
      {open && <StepUpDialog onDone={done} />}
    </StepUpContext.Provider>
  )
}

/** The guard, or a pass-through outside a provider */
export const useStepUp = () =>
  useContext(StepUpContext) ?? {
    guard: ((run) => run()) as Guard,
    confirm: async () => false,
  }

const StepUpDialog: React.FC<{ onDone: (ok: boolean) => void }> = ({ onDone }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  const send = async () => {
    setBusy(true)
    setMessage(null)
    const result = await api<{ challengeId: number }>('/next/members/step-up', { body: {} })
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'We could not send a code just now.')
    setChallengeId(result.data.challengeId)
    setCode('')
  }

  const check = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const result = await api('/next/members/step-up/confirm', { body: { challengeId, code } })
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'That code was not accepted.')
    dialog.current?.close()
    onDone(true)
  }

  return (
    <dialog
      aria-labelledby="step-up-title"
      className="privacy-dialog m-auto w-[min(100%-2rem,32rem)] bg-background p-6 text-[var(--text)] sm:p-8"
      onCancel={() => onDone(false)}
      ref={dialog}
    >
      <h2 className="display-sm" id="step-up-title">
        Confirm it is you
      </h2>
      <p className="measure mt-3">
        To keep your details safe, we ask again before this, if you signed in more than half an hour
        ago. We will email a code to your address.
      </p>
      {challengeId === null ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
          <button
            className="btn btn-solid min-h-11"
            disabled={busy}
            onClick={() => void send()}
            type="button"
          >
            {busy ? <Sending /> : 'Email me a code'}
          </button>
          <button className="link link-caps min-h-11" onClick={() => onDone(false)} type="button">
            Not now
          </button>
        </div>
      ) : (
        <form className="mt-6" noValidate onSubmit={check}>
          <label className="label mb-1 block" htmlFor="step-up-code">
            Six-digit code
          </label>
          <input
            autoComplete="one-time-code"
            className={`${fieldClass} max-w-xs tracking-[0.4em]`}
            id="step-up-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            value={code}
          />
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
            <button
              className="btn btn-solid min-h-11"
              disabled={busy || code.length !== 6}
              type="submit"
            >
              {busy ? 'Checking…' : 'Confirm'}
            </button>
            <button
              className="link link-caps min-h-11"
              disabled={busy}
              onClick={() => void send()}
              type="button"
            >
              Send a new code
            </button>
            <button className="link link-caps min-h-11" onClick={() => onDone(false)} type="button">
              Not now
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="mt-4 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}
    </dialog>
  )
}
