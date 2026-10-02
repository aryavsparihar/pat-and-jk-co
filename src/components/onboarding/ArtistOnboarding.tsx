'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { ARTIST_STEPS, type ArtistStep } from '@/members/forms/schemas'
import { stepValues } from '@/members/forms/values'
import type { Application } from '@/payload-types'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

import { api } from './api'
import { AboutStep, AddressStep, PracticeStep, type Values } from './artist/steps'
import { PortfolioStep } from './artist/Portfolio'
import { ReviewStep } from './artist/Review'
import { CodeSignIn } from './CodeSignIn'
import { ErrorSummary, type Errors } from './fields'

const STEP_TITLES: Record<ArtistStep, { title: string; intro: string }> = {
  about: { title: 'About you', intro: 'A few details so we know who we are speaking to.' },
  address: {
    title: 'Where you live',
    intro: 'So we know where to find you, and where to send post.',
  },
  practice: { title: 'Your practice', intro: 'How you work, and what you make.' },
  portfolio: {
    title: 'Your work',
    intro: 'A small selection of the work you would like us to see.',
  },
  review: { title: 'Review and send', intro: 'Check everything once more, then send it to us.' },
}

/** Sets a value at a dotted path ("residence.city", "works.2.title") without mutating */
const setAt = (object: Values, path: string, value: unknown): Values => {
  const [head, ...rest] = path.split('.')
  const key = /^\d+$/.test(head!) ? Number(head) : head!
  const copy: Values = Array.isArray(object) ? [...object] : { ...object }
  copy[key] = rest.length
    ? setAt(copy[key] ?? (/^\d+$/.test(rest[0]!) ? [] : {}), rest.join('.'), value)
    : value
  return copy
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'signin' }
  | { kind: 'open'; application: Application }
  | { kind: 'closed'; application: Application }
  | { kind: 'sent'; reference: string }

/**
 * The artist's application, one step at a time. Each step is saved on the server as it is
 * finished, so an artist can close the tab and pick up later by signing in again; nothing personal
 * is ever kept in the browser.
 */
export const ArtistOnboarding: React.FC<{ formToken: string }> = ({ formToken }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [step, setStep] = useState<ArtistStep>('about')
  const [values, setValues] = useState<Record<string, Values>>({})
  const [completed, setCompleted] = useState<string[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)

  /** Who is signed in, and their artist application: fetched, then applied, so state is set in a callback */
  const fetchState = useCallback(async (): Promise<Phase> => {
    const session = await api<{ signedIn: boolean }>('/next/members/session')
    if (!session.data.signedIn) return { kind: 'signin' }

    let result = await api<{ application: Application | null }>(
      '/next/members/application?type=artist',
    )
    if (result.ok && !result.data.application) {
      // Signed in already (as a partner, say): start an artist application on the same account
      await api('/next/members/application/start', { body: { type: 'artist' } })
      result = await api<{ application: Application | null }>(
        '/next/members/application?type=artist',
      )
    }
    const application = result.data.application
    if (!application) return { kind: 'signin' }
    const open = application.stage === 'draft' || application.stage === 'changes-requested'
    return { kind: open ? 'open' : 'closed', application }
  }, [])

  const apply = useCallback((next: Phase) => {
    if (next.kind === 'open' || next.kind === 'closed') {
      const { application } = next
      setValues(Object.fromEntries(ARTIST_STEPS.map((s) => [s, stepValues(s, application)])))
      const done = application.completedSteps ?? []
      setCompleted(done)
      setStep(ARTIST_STEPS.find((s) => !done.includes(s)) ?? 'review')
    }
    setPhase(next)
  }, [])

  const load = useCallback(() => fetchState().then(apply), [fetchState, apply])

  useEffect(() => {
    let current = true
    void fetchState().then((next) => {
      if (current) apply(next)
    })
    return () => {
      current = false
    }
  }, [fetchState, apply])

  const go = (next: ArtistStep) => {
    setStep(next)
    setErrors({})
    setMessage(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => heading.current?.focus(), 50)
  }

  const set = (path: string, value: unknown) => {
    setValues((all) => ({ ...all, [step]: setAt(all[step] ?? {}, path, value) }))
    setSaved(false)
  }

  const save = async (): Promise<boolean> => {
    setBusy(true)
    setErrors({})
    setMessage(null)
    const result = await api<{ completedSteps: string[] }>('/next/members/application/step', {
      body: { step, data: values[step] },
    })
    setBusy(false)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      setMessage(result.data.errors ? null : (result.data.message ?? 'That could not be saved.'))
      return false
    }
    setCompleted(result.data.completedSteps)
    setSaved(true)
    return true
  }

  const next = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!(await save())) return
    const index = ARTIST_STEPS.indexOf(step)
    go(ARTIST_STEPS[index + 1] ?? 'review')
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!(await save())) return
    setBusy(true)
    const result = await api<{ reference: string }>('/next/members/application/submit', {
      body: { [HONEYPOT_FIELD]: honeypot },
    })
    setBusy(false)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      setMessage(result.data.message ?? 'Your application could not be sent.')
      return
    }
    setPhase({ kind: 'sent', reference: result.data.reference })
    window.scrollTo({ top: 0 })
  }

  if (phase.kind === 'loading') {
    return (
      <p className="muted" role="status">
        One moment…
      </p>
    )
  }

  if (phase.kind === 'signin') {
    return <CodeSignIn formToken={formToken} onSignedIn={load} purpose="apply-artist" />
  }

  if (phase.kind === 'sent') {
    return (
      <div role="status">
        <h2 className="display-md">Thank you. We have your application.</h2>
        <p className="lede measure mt-6">
          Your reference is <strong className="tracking-wider">{phase.reference}</strong>. We have
          emailed it to you as well.
        </p>
        <p className="measure mt-6">
          We look at every application ourselves, and we will write to you once we have. You can see
          where it has got to at any time by signing in.
        </p>
        <a className="btn btn-solid mt-10 min-h-11" href="/account">
          Your account
        </a>
      </div>
    )
  }

  if (phase.kind === 'closed') {
    const { application } = phase
    const words: Record<string, string> = {
      submitted: 'We have your application and will look at it soon.',
      'under-review': 'We are looking at your application now.',
      approved: 'Your application has been approved. Welcome.',
      rejected: 'We are not able to take your application further at present.',
    }
    return (
      <div>
        <p className="label">Application {application.reference}</p>
        <h2 className="display-md mt-3">{words[application.stage] ?? 'Your application'}</h2>
        <a className="btn btn-solid mt-10 min-h-11" href="/account">
          Your account
        </a>
      </div>
    )
  }

  const { application } = phase
  const index = ARTIST_STEPS.indexOf(step)
  const current = values[step] ?? {}
  const meta = STEP_TITLES[step]

  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Application steps">
        <p className="label mb-4">Application {application.reference}</p>
        <ol className="grid gap-y-1">
          {ARTIST_STEPS.map((s, i) => {
            const done = completed.includes(s)
            const reachable = done || i <= ARTIST_STEPS.findIndex((x) => !completed.includes(x))
            return (
              <li key={s}>
                <button
                  aria-current={s === step ? 'step' : undefined}
                  className="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-50 aria-[current=step]:font-medium"
                  disabled={!reachable}
                  onClick={() => go(s)}
                  type="button"
                >
                  <span aria-hidden className="w-5 text-primary">
                    {done ? '✓' : `${i + 1}.`}
                  </span>
                  <span
                    className={s === step ? 'underline decoration-1 underline-offset-[0.25em]' : ''}
                  >
                    {STEP_TITLES[s].title}
                  </span>
                  {done && <span className="sr-only"> (saved)</span>}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <form noValidate onSubmit={step === 'review' ? send : next}>
        {application.stage === 'changes-requested' && application.decisionNote && (
          <div className="mb-10 border-l-2 border-primary bg-surface py-5 pl-6 pr-4">
            <p className="font-medium">A note from us</p>
            <p className="measure mt-2 whitespace-pre-line">{application.decisionNote}</p>
          </div>
        )}

        <p className="label">
          Step {index + 1} of {ARTIST_STEPS.length}
        </p>
        <h2 className="display-md mt-2 outline-none" ref={heading} tabIndex={-1}>
          {meta.title}
        </h2>
        <p className="lede measure mt-4">{meta.intro}</p>

        {saved && (
          <p className="mt-6 text-base text-primary" role="status">
            Saved. You can close this page and come back to it by signing in.
          </p>
        )}

        <div className="mt-10">
          <ErrorSummary errors={errors} />
          {message && (
            <p className="mb-8 text-base italic text-destructive" role="alert">
              {message}
            </p>
          )}

          {step === 'about' && <AboutStep errors={errors} set={set} values={current} />}
          {step === 'address' && <AddressStep errors={errors} set={set} values={current} />}
          {step === 'practice' && <PracticeStep errors={errors} set={set} values={current} />}
          {step === 'portfolio' && <PortfolioStep errors={errors} set={set} values={current} />}
          {step === 'review' && (
            <ReviewStep
              all={values}
              errors={errors}
              onEdit={(s) => go(s as ArtistStep)}
              set={set}
              values={current}
            />
          )}
        </div>

        {step === 'review' && (
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor={`${HONEYPOT_FIELD}-send`}>Company website</label>
            <input
              autoComplete="off"
              id={`${HONEYPOT_FIELD}-send`}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              value={honeypot}
            />
          </div>
        )}

        <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border pt-8">
          <button className="btn btn-solid min-h-11" disabled={busy} type="submit">
            {busy ? 'Saving…' : step === 'review' ? 'Send my application' : 'Save and continue'}
          </button>
          {index > 0 && (
            <button
              className="link link-caps min-h-11"
              onClick={() => go(ARTIST_STEPS[index - 1]!)}
              type="button"
            >
              Back
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
