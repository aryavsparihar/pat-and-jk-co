'use client'

import React, { useState } from 'react'

type Stage = 'email' | 'code' | 'done' | 'request'

const post = async (url: string, body: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as {
    message?: string
    challengeId?: string
  }
  return { ok: response.ok, ...data }
}

/** The two-step sign-in gate: company email, then the code sent to that mailbox. */
export const GateForm: React.FC<{ next: string; domain: string }> = ({ next, domain }) => {
  const [stage, setStage] = useState<Stage>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await post('/next/admin-gate/request-code', { email })
    setBusy(false)
    if (!result.ok) return setError(result.message ?? 'Something went wrong.')
    setChallengeId(String(result.challengeId ?? ''))
    setNote(result.message ?? null)
    setStage('code')
  }

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await post('/next/admin-gate/verify-code', { challengeId, code })
    setBusy(false)
    if (!result.ok) return setError(result.message ?? 'That code was not accepted.')
    setStage('done')
    window.location.assign(next)
  }

  const requestAccess = async (event: React.FormEvent) => {
    event.preventDefault()
    const form = event.target as HTMLFormElement
    const data = new FormData(form)
    setBusy(true)
    setError(null)
    const result = await post('/next/admin-gate/request-access', {
      email: data.get('email'),
      name: data.get('name'),
      message: data.get('message'),
    })
    setBusy(false)
    setNote(result.message ?? null)
    setStage('email')
  }

  const field =
    'w-full rounded-none border-0 border-b border-input bg-transparent px-0 py-2 text-[1.15rem] text-[var(--text)] focus:border-primary focus:outline-none'

  if (stage === 'request') {
    return (
      <form className="mt-10" onSubmit={requestAccess}>
        <p className="measure">
          Ask for an account. The technical director approves every request before an account is
          created, and you will then receive an email to set your password.
        </p>
        <div className="mt-8 space-y-7">
          <div>
            <label className="label mb-1 block" htmlFor="request-name">
              Your name
            </label>
            <input className={field} id="request-name" name="name" required />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="request-email">
              Work email at {domain}
            </label>
            <input
              className={field}
              id="request-email"
              inputMode="email"
              name="email"
              required
              type="email"
            />
          </div>
          <div>
            <label className="label mb-1 block" htmlFor="request-message">
              What do you need access for?
            </label>
            <textarea className={field} id="request-message" name="message" rows={3} />
          </div>
        </div>
        {error && (
          <p className="mt-6 text-base italic text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <button className="btn btn-solid" disabled={busy} type="submit">
            {busy ? 'Sending…' : 'Send request'}
          </button>
          <button className="link link-caps" onClick={() => setStage('email')} type="button">
            Back to sign in
          </button>
        </div>
      </form>
    )
  }

  if (stage === 'code' || stage === 'done') {
    return (
      <form className="mt-10" onSubmit={verifyCode}>
        {note && <p className="measure">{note}</p>}
        <div className="mt-8">
          <label className="label mb-1 block" htmlFor="gate-code">
            Six-digit code
          </label>
          <input
            autoComplete="one-time-code"
            autoFocus
            className={`${field} tracking-[0.4em]`}
            id="gate-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            pattern="[0-9]*"
            required
            value={code}
          />
        </div>
        {error && (
          <p className="mt-6 text-base italic text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <button className="btn btn-solid" disabled={busy || stage === 'done'} type="submit">
            {stage === 'done' ? 'Opening the admin panel…' : busy ? 'Checking…' : 'Continue'}
          </button>
          <button
            className="link link-caps"
            onClick={() => {
              setStage('email')
              setCode('')
              setError(null)
            }}
            type="button"
          >
            Use a different address
          </button>
        </div>
      </form>
    )
  }

  return (
    <form className="mt-10" onSubmit={requestCode}>
      {note && <p className="measure mb-6">{note}</p>}
      <div>
        <label className="label mb-1 block" htmlFor="gate-email">
          Work email at {domain}
        </label>
        <input
          autoComplete="username"
          autoFocus
          className={field}
          id="gate-email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      {error && (
        <p className="mt-6 text-base italic text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
        <button className="btn btn-solid" disabled={busy} type="submit">
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
        <button className="link link-caps" onClick={() => setStage('request')} type="button">
          Request access
        </button>
      </div>
    </form>
  )
}
