'use client'

import React, { useEffect, useState } from 'react'

import { api } from '../onboarding/api'
import { TextField } from '../onboarding/fields'

type Session = {
  id: number
  device: string
  signedInAt: string
  lastSeenAt: string
  current: boolean
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

/** Changing the email address: a code to the new address confirms it */
export const EmailChange: React.FC<{ current: string }> = ({ current }) => {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const request = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    const result = await api<{ challengeId: number; message: string }>(
      '/next/members/portal/email',
      { body: { email } },
    )
    setBusy(false)
    if (!result.ok) {
      setErrors(result.data.errors ?? { email: result.data.message ?? 'That did not work.' })
      return
    }
    setChallengeId(result.data.challengeId)
    setMessage(result.data.message)
  }

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    const result = await api<{ email: string }>('/next/members/portal/email/confirm', {
      body: { challengeId, code },
    })
    setBusy(false)
    if (!result.ok) {
      setErrors({ code: result.data.message ?? 'That code was not accepted.' })
      return
    }
    setDone(result.data.email)
  }

  if (done) {
    return (
      <p className="measure" role="status">
        Your email address is now {done}. We have told your old address, and signed you out on every
        other device.
      </p>
    )
  }

  return challengeId ? (
    <form noValidate onSubmit={confirm}>
      <p className="measure mb-6" role="status">
        {message} Enter it here to finish. Until you do, nothing changes.
      </p>
      <TextField
        autoComplete="one-time-code"
        className="max-w-xs"
        errors={errors}
        inputMode="numeric"
        label="Six-digit code"
        maxLength={6}
        name="code"
        onValue={(x) => setCode(x.replace(/\D/g, ''))}
        value={code}
      />
      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
        <button className="btn btn-outline min-h-11" disabled={busy} type="submit">
          {busy ? 'Checking…' : 'Confirm the new address'}
        </button>
        <button
          className="link link-caps min-h-11"
          onClick={() => setChallengeId(null)}
          type="button"
        >
          Use a different address
        </button>
      </div>
    </form>
  ) : (
    <form noValidate onSubmit={request}>
      <p className="mb-6">
        Your email address is <strong className="font-medium">{current}</strong>. Codes to sign in
        go there.
      </p>
      <TextField
        autoComplete="email"
        className="max-w-md"
        errors={errors}
        hint="We will send a code to it. The change happens only once you enter that code."
        label="New email address"
        name="email"
        onValue={setEmail}
        type="email"
        value={email}
      />
      <button
        className="btn btn-outline mt-6 min-h-11"
        disabled={busy || !email.includes('@')}
        type="submit"
      >
        {busy ? 'Sending…' : 'Send a code to the new address'}
      </button>
    </form>
  )
}

/** Every device signed in, with a way to sign any one out, or all of them */
export const SessionsList: React.FC = () => {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void api<{ sessions: Session[] }>('/next/members/portal/sessions').then((r) => {
      if (current) setSessions(r.ok ? r.data.sessions : [])
    })
    return () => {
      current = false
    }
  }, [])

  const end = async (session: Session) => {
    const result = await api(`/next/members/portal/sessions/${session.id}`, { method: 'DELETE' })
    if (!result.ok) return setMessage(result.data.message ?? 'That device could not be signed out.')
    setSessions((all) => (all ?? []).filter((s) => s.id !== session.id))
    setMessage(`${session.device} has been signed out.`)
  }

  const everywhere = async () => {
    await api('/next/members/sign-out-everywhere', { body: {} })
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/collaborate/signin')
  }

  if (!sessions)
    return (
      <p className="muted" role="status">
        One moment…
      </p>
    )

  return (
    <div>
      <ul>
        {sessions.map((s) => (
          <li
            className="grid gap-x-8 gap-y-1 border-t border-border py-4 sm:grid-cols-[1fr_auto]"
            key={s.id}
          >
            <span>
              <span className="block">
                {s.device}
                {s.current && <span className="muted"> (this device)</span>}
              </span>
              <span className="muted block text-base">
                Signed in {when(s.signedInAt)}, last used {when(s.lastSeenAt)}
              </span>
            </span>
            {!s.current && (
              <button className="link min-h-11 self-center" onClick={() => end(s)} type="button">
                Sign out<span className="sr-only"> {s.device}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <button className="btn btn-outline mt-6 min-h-11" onClick={everywhere} type="button">
        Sign out on every device
      </button>
      <p aria-live="polite" className="mt-4 text-base" role="status">
        {message ?? ''}
      </p>
    </div>
  )
}

const REQUESTS = [
  {
    kind: 'download',
    label: 'Ask for a copy of my data',
    confirm: null,
  },
  {
    kind: 'withdraw-consent',
    label: 'Withdraw consent to my identity and bank details',
    confirm:
      'Withdraw consent? We stop using your identity and bank details, and delete them unless the law makes us keep them. We cannot pay you without them.',
  },
  {
    kind: 'delete',
    label: 'Ask for my account and data to be deleted',
    confirm:
      'Ask for your account to be deleted? Our team will write to you before anything is deleted.',
  },
] as const

/** A member's requests about their own data; each is recorded and goes to our team */
export const DataRequests: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ask = async (kind: (typeof REQUESTS)[number]['kind'], confirmText: string | null) => {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    const result = await api<{ message: string }>('/next/members/data-request', { body: { kind } })
    setBusy(false)
    setMessage(result.data.message ?? 'That could not be sent.')
  }

  return (
    <div>
      <ul className="grid gap-y-3">
        {REQUESTS.map((r) => (
          <li key={r.kind}>
            <button
              className="link min-h-11 text-left"
              disabled={busy}
              onClick={() => ask(r.kind, r.confirm)}
              type="button"
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-4 text-base text-primary" role="status">
        {message ?? ''}
      </p>
    </div>
  )
}
