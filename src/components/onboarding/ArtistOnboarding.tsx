'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { ARTIST_STEPS, type ArtistStep } from '@/members/forms/schemas'
import { stepValues } from '@/members/forms/values'
import type { Application } from '@/payload-types'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

import { api } from './api'
import { AboutStep, AddressStep, PracticeStep, type Values } from './artist/steps'
import { KycStep } from './artist/KycStep'
import { PortfolioStep } from './artist/Portfolio'
import { ReviewStep } from './artist/Review'
import { CodeSignIn } from './CodeSignIn'
import { Sending } from './Sending'
import { GarlandProgress } from '@/components/phulhaar/GarlandProgress'

import { ErrorSummary, type Errors } from './fields'

const STEP_TITLES: Record<ArtistStep, { title: string; intro: string }> = {
  about: { title: 'About you', intro: 'A few details, so we know who we are writing to.' },
  address: {
    title: 'Where you live',
    intro: 'Where you live, and where we should send post.',
  },
  practice: {
    title: 'Your practice',
    intro: 'What you make, how you came to it, and where it has been seen.',
  },
  portfolio: {
    title: 'Your work',
    intro: 'A small selection of the work you would like us to see.',
  },
  kyc: {
    title: 'Identity',
    intro: 'So that we can be sure of who you are, and pay you.',
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
export const ArtistOnboarding: React.FC<{
  formToken: string
  /** The artists' Terms & Conditions, while published in Site settings */
  terms?: { url: string; filename: string } | null
  /** The privacy policy, rendered on the server, for the consent in the Identity step */
  privacy?: React.ReactNode
}> = ({ formToken, terms, privacy }) => {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [step, setStep] = useState<ArtistStep>('about')
  const [values, setValues] = useState<Record<string, Values>>({})
  const [completed, setCompleted] = useState<string[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  // The session ran out mid-step: sign in again here, keeping what was typed
  const [signedOut, setSignedOut] = useState(false)
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
    setSaved(false)
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
    if (result.status === 401) {
      setSignedOut(true)
      return false
    }
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      setMessage(result.data.errors ? null : (result.data.message ?? 'That could not be saved.'))
      return false
    }
    setCompleted(result.data.completedSteps)
    return true
  }

  /** Saves this step without moving on, and says so: the only time "Saved" is shown */
  const saveForLater = async () => {
    if (await save()) setSaved(true)
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
    if (application.stage === 'rejected') {
      return <Declined application={application} onReopened={load} />
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
  const header = (
    <>
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
    </>
  )

  return (
    <div>
      <p className="label mb-6">Application {application.reference}</p>
      <GarlandProgress
        completed={completed}
        current={step}
        onGo={go}
        steps={ARTIST_STEPS}
        titles={
          Object.fromEntries(ARTIST_STEPS.map((s) => [s, STEP_TITLES[s].title])) as Record<
            ArtistStep,
            string
          >
        }
      />
      <div className="step-in mt-14" key={step}>
        {step === 'kyc' ? (
          <div>
            {header}
            <div className="mt-10">
              <KycStep
                dateOfBirth={values.about?.dateOfBirth}
                privacy={privacy}
                onSaved={(done) => {
                  setCompleted(done)
                  go('review')
                }}
              />
            </div>
            <button
              className="link link-caps mt-6 min-h-11"
              onClick={() => go(ARTIST_STEPS[index - 1]!)}
              type="button"
            >
              Back
            </button>
          </div>
        ) : (
          <>
            {/* Outside the step's form: the sign-in form cannot sit inside another form */}
            {signedOut && (
              <div
                className="mb-10 border-l-2 border-primary bg-surface py-6 pl-6 pr-4"
                role="alert"
              >
                <p className="measure mb-6">
                  You have been signed out, so this step was not saved. Sign in again here: what you
                  have typed stays on the page.
                </p>
                <CodeSignIn
                  formToken={formToken}
                  onSignedIn={() => {
                    setSignedOut(false)
                    setMessage(null)
                  }}
                  purpose="signin"
                />
              </div>
            )}
            <form noValidate onSubmit={step === 'review' ? send : next}>
              {header}

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
                {step === 'portfolio' && (
                  <PortfolioStep errors={errors} set={set} values={current} />
                )}
                {step === 'review' && (
                  <ReviewStep
                    all={values}
                    errors={errors}
                    onEdit={(s) => go(s as ArtistStep)}
                    set={set}
                    terms={terms}
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
                  {busy
                    ? 'Saving…'
                    : step === 'review'
                      ? 'Send my application'
                      : 'Save and continue'}
                </button>
                {step !== 'review' && (
                  <button
                    className="btn btn-outline min-h-11"
                    disabled={busy}
                    onClick={saveForLater}
                    type="button"
                  >
                    Save and finish later
                  </button>
                )}
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
              {saved && (
                <p className="mt-6 text-base text-primary" role="status">
                  Saved. You can close this page and come back to it by signing in.
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A declined application. Once the wait is over, "Apply again" reopens it: the same reference,
 * the first three steps filled in to review, the work and identity to add afresh.
 */
const Declined: React.FC<{ application: Application; onReopened: () => void }> = ({
  application,
  onReopened,
}) => {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const from = application.reapplyFrom ? new Date(application.reapplyFrom) : null
  // eslint-disable-next-line react-hooks/purity -- read once per render, to say whether the wait is over
  const ready = from ? from.getTime() <= Date.now() : false

  const reopen = async () => {
    setBusy(true)
    setMessage(null)
    const result = await api('/next/members/application/reapply', { body: { type: 'artist' } })
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'That could not be done just now.')
    onReopened()
  }

  return (
    <div>
      <p className="label">Application {application.reference}</p>
      <h2 className="display-md mt-3">
        We are not able to take your application further at present.
      </h2>
      {from && !ready && (
        <p className="lede measure mt-6">
          You are welcome to apply again from {longDate(application.reapplyFrom!)}.
        </p>
      )}
      {ready && (
        <>
          <p className="lede measure mt-6">You are welcome to apply again.</p>
          <p className="measure mt-4">
            Your application keeps its reference. What you told us about yourself, where you live
            and your practice will be there to review. Your work and your identity details start
            afresh.
          </p>
          <button
            className="btn btn-solid mt-10 min-h-11"
            disabled={busy}
            onClick={() => void reopen()}
            type="button"
          >
            {busy ? <Sending label="Opening" /> : 'Apply again'}
          </button>
        </>
      )}
      {message && (
        <p className="mt-4 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}
      {!ready && (
        <a className="btn btn-solid mt-10 min-h-11" href="/account">
          Your account
        </a>
      )}
    </div>
  )
}
