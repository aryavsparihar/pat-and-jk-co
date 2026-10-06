'use client'

import { BotCheckHelp } from '@/components/turnstile/BotCheckHelp'
import { type BotCheckProblem, useTurnstile } from '@/components/turnstile/useTurnstile'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'
import React, { useEffect, useRef, useState } from 'react'

import { api } from './api'
import { fieldClass } from './fields'

type Purpose = 'signin' | 'apply-artist' | 'apply-partner'

const COPY: Record<Purpose, { intro: string; button: string }> = {
  signin: {
    intro:
      'Enter the email address you applied with. We will send you a code to sign in. There is no password.',
    button: 'Email me a code',
  },
  'apply-artist': {
    intro:
      'Start with your email address. We will send you a code to confirm it, and you can come back to your application at any time by signing in the same way.',
    button: 'Email me a code',
  },
  'apply-partner': {
    intro: 'Start with your email address. We will send you a code to confirm it is yours.',
    button: 'Email me a code',
  },
}

/**
 * Email, then the six-digit code sent to it. Used to sign in, and as the first step of both
 * applications. Carries the hidden honeypot field and the signed form-start token.
 */
export const CodeSignIn: React.FC<{
  purpose: Purpose
  formToken: string
  onSignedIn: () => void
  headingLevel?: 'h2' | 'h3'
}> = ({ purpose, formToken, onSignedIn }) => {
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)
  const bot = useTurnstile(purpose)
  const [botProblem, setBotProblem] = useState<BotCheckProblem | null>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    setBotProblem(null)
    // Without the check nothing is sent: the person is told why and what to do
    const human = await bot.getToken()
    if (human.problem) {
      setBusy(false)
      return setBotProblem(human.problem)
    }
    const result = await api<{ challengeId: number; retryCheck?: boolean }>(
      '/next/members/request-code',
      {
        body: {
          email,
          purpose,
          formToken,
          [HONEYPOT_FIELD]: honeypot,
          [TURNSTILE_FIELD]: human.token,
        },
      },
    )
    setBusy(false)
    if (!result.ok && result.data.retryCheck) return setBotProblem('failed')
    if (!result.ok)
      return setError(result.data.message ?? 'Something went wrong. Please try again.')
    setChallengeId(result.data.challengeId ?? null)
    setMessage(result.data.message ?? null)
    setStage('code')
    setCode('')
    setResendIn(30)
    setTimeout(() => codeRef.current?.focus(), 0)
  }

  const verify = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await api('/next/members/verify-code', { body: { challengeId, code } })
    setBusy(false)
    if (!result.ok) return setError(result.data.message ?? 'That code was not accepted.')
    onSignedIn()
  }

  const form =
    stage === 'code' ? (
      <form noValidate onSubmit={verify}>
        <p aria-live="polite" className="measure">
          {message} It may take a minute to arrive; check your spam folder if it does not.
        </p>
        <div className="mt-8 max-w-xs">
          <label className="label mb-1 block" htmlFor="member-code">
            Six-digit code
          </label>
          <input
            aria-describedby={error ? 'member-code-error' : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="one-time-code"
            className={`${fieldClass} tracking-[0.4em]`}
            id="member-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            pattern="[0-9]*"
            ref={codeRef}
            required
            value={code}
          />
          {error && (
            <p
              className="mt-2 text-base italic text-destructive"
              id="member-code-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <button
            className="btn btn-solid min-h-11"
            disabled={busy || code.length !== 6}
            type="submit"
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <button
            className="link link-caps min-h-11"
            disabled={busy || resendIn > 0}
            onClick={() => requestCode()}
            type="button"
          >
            {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
          </button>
          <button
            className="link link-caps min-h-11"
            onClick={() => setStage('email')}
            type="button"
          >
            Use another address
          </button>
        </div>
      </form>
    ) : (
      <form noValidate onSubmit={requestCode}>
        <p className="measure">{COPY[purpose].intro}</p>
        <div className="mt-8 max-w-md">
          <label className="label mb-1 block" htmlFor="member-email">
            Email address
          </label>
          <input
            aria-describedby={error ? 'member-email-error' : undefined}
            aria-invalid={error ? true : undefined}
            autoComplete="email"
            className={fieldClass}
            id="member-email"
            inputMode="email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
          {error && (
            <p
              className="mt-2 text-base italic text-destructive"
              id="member-email-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        {/* Hidden from people and from screen readers; bots fill it in */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={HONEYPOT_FIELD}>Company website</label>
          <input
            autoComplete="off"
            id={HONEYPOT_FIELD}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            value={honeypot}
          />
        </div>
        <button
          className="btn btn-solid mt-9 min-h-11"
          disabled={busy || !email.includes('@')}
          type="submit"
        >
          {busy ? 'Sending…' : COPY[purpose].button}
        </button>
      </form>
    )

  // Outside both stages, so the check is still there for "send a new code"
  return (
    <>
      {form}
      {botProblem && <BotCheckHelp problem={botProblem} />}
      {bot.element}
    </>
  )
}
