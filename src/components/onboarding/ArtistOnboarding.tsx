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
import { ApplicationSteps, ApplyHero, ApplySide } from './ApplyFrame'
import { CodeSignIn } from './CodeSignIn'

import { ErrorSummary, type Errors } from './fields'
import { DeclinedNotice } from './DeclinedNotice'
import { ApplyAgainButton } from '@/components/account/ApplicationActions'
import type { SocialPlatform } from '@/brands/socialIcons'

const STEP_TITLES: Record<ArtistStep, { title: string; intro: string }> = {
  about: { title: 'About you', intro: 'So that we know who we are writing to.' },
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
    intro: 'Three to ten works that show what you do best.',
  },
  review: { title: 'Review and send', intro: 'Check everything once more, then send it to us.' },
}

/** After sending (the ApplySent design): what happens next, I to IV */
const NEXT_STEPS: [string, string, string][] = [
  [
    'I',
    'We read it',
    'Every application is read by someone at the gallery, and we reply within seven days.',
  ],
  [
    'II',
    'We talk',
    'If your work is a good fit, we will write to you, to talk it through or to ask a question or two.',
  ],
  [
    'III',
    'Confirm who you are',
    'If we go ahead, we ask you to confirm who you are in your account, with your PAN or passport, a second ID showing your address, and a photo of you.',
  ],
  [
    'IV',
    'The agreement',
    'We send you our agreement to read and sign online. Once we have both signed, you receive your member ID.',
  ],
]

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

/** A page of the application outside the steps: the label column, then the content */
const Plain: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="house-sec border-t border-[#e3cfa3]">
    <div className="house-lab" />
    <div className="house-con max-w-[780px]">{children}</div>
  </section>
)

/**
 * The artist's application, five steps one at a time (the Apply1 to Apply5 designs). Each step is
 * saved on the server as it is finished, so an artist can close the tab and pick up later by
 * signing in again; nothing personal is ever kept in the browser. Identity is not asked for here:
 * it comes after approval, before the agreement.
 */
export const ArtistOnboarding: React.FC<{
  formToken: string
  /** Phulhaar's social accounts, from Site settings, for the screen after a decline */
  socials?: { platform: SocialPlatform; label: string; url: string }[]
}> = ({ formToken, socials = [] }) => {
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
      setMessage(
        result.data.errors
          ? null
          : (result.data.message ??
              'We could not save this step. What you typed is still here: please try again.'),
      )
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
      setMessage(
        result.data.message ?? 'Your application could not be sent. Please try again in a minute.',
      )
      return
    }
    setPhase({ kind: 'sent', reference: result.data.reference })
    window.scrollTo({ top: 0 })
  }

  if (phase.kind === 'loading') {
    return (
      <>
        <ApplyHero />
        <Plain>
          <p className="muted" role="status">
            One moment…
          </p>
        </Plain>
      </>
    )
  }

  if (phase.kind === 'signin') {
    return (
      <>
        <ApplyHero />
        <Plain>
          <CodeSignIn formToken={formToken} onSignedIn={load} purpose="apply-artist" />
        </Plain>
      </>
    )
  }

  if (phase.kind === 'sent') {
    return (
      <section className="house-hero" role="status">
        <div className="house-lab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="h-auto w-14" height={56} src="/brand/wreath.png" width={56} />
        </div>
        <div className="house-con max-w-[780px]">
          <p className="house-small">Apply as an artist</p>
          <h1 className="apply-h1">Thank you. Your application has reached us.</h1>
          <p className="house-lead">
            Your application number is{' '}
            <strong className="font-medium tracking-wider">{phase.reference}</strong>.
          </p>
          <h2 className="apply-h2 mt-12">What happens next</h2>
          <ol className="mt-2">
            {NEXT_STEPS.map(([number, title, text]) => (
              <li className="house-row" key={number}>
                <span aria-hidden className="house-num">
                  {number}
                </span>
                <p className="house-rt m-0">{title}</p>
                <p className="house-rb">{text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a className="house-btn" href="/next/members/view?to=artist">
              Go to your account
            </a>
            <a className="house-tl" href="/ventures/phulhaar-gallery">
              About Phulhaar Gallery
            </a>
          </div>
        </div>
      </section>
    )
  }

  if (phase.kind === 'closed') {
    const { application } = phase
    const words: Record<string, string> = {
      submitted: 'We have your application and will look at it soon.',
      'under-review': 'We are looking at your application now.',
      approved: 'Your application has been approved. Welcome.',
    }
    if (application.stage === 'rejected') {
      const ready = waitIsOver(application.reapplyFrom)
      return (
        <Plain>
          <DeclinedNotice
            action={ready ? <ApplyAgainButton kind="artist" /> : undefined}
            kind="artist"
            note={application.decisionNote}
            reapplyFrom={application.reapplyFrom}
            ready={ready}
            reference={application.reference}
            socials={socials}
          />
        </Plain>
      )
    }
    if (application.stage === 'withdrawn') {
      return (
        <Plain>
          <p className="house-small">Application {application.reference}</p>
          <h2 className="apply-h2 mt-3">You withdrew this application.</h2>
          <p className="house-p mt-6">
            You are welcome to apply again whenever you like. A new application starts with your
            answers filled in, for you to check.
          </p>
          <div className="mt-10">
            <ApplyAgainButton kind="artist" />
          </div>
        </Plain>
      )
    }
    return (
      <Plain>
        <p className="house-small">Application {application.reference}</p>
        <h2 className="apply-h2 mt-3">{words[application.stage] ?? 'Your application'}</h2>
        <a className="house-btn mt-10" href="/next/members/view?to=artist">
          Go to your account
        </a>
      </Plain>
    )
  }

  const { application } = phase
  const index = ARTIST_STEPS.indexOf(step)
  const current = values[step] ?? {}
  const meta = STEP_TITLES[step]
  const back =
    index > 0 ? (
      <button
        className="link link-caps min-h-11"
        onClick={() => go(ARTIST_STEPS[index - 1]!)}
        type="button"
      >
        Back
      </button>
    ) : null

  return (
    <>
      {step === 'about' && <ApplyHero />}
      <section
        className={`flex flex-wrap gap-8 ${step === 'about' ? 'border-t border-[#e3cfa3] pt-10' : 'pt-14'}`}
      >
        <ApplySide first={step === 'about'} reference={application.reference ?? ''} />
        <div className="house-con">
          <ApplicationSteps
            completed={completed}
            current={step}
            onGo={go}
            steps={ARTIST_STEPS.map((s) => ({ step: s, label: STEP_TITLES[s].title }))}
          />
        </div>
      </section>

      <section className="flex flex-wrap gap-8 pb-[clamp(4rem,8vw,6.25rem)] pt-10">
        <div className="house-lab" />
        <div className="house-con max-w-[780px] step-in" key={step}>
          {/* Outside the step's form: the sign-in form cannot sit inside another form */}
          {signedOut && (
            <div className="apply-notice mb-10" role="alert">
              <p className="mb-6">
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
            {application.stage === 'changes-requested' && application.decisionNote && (
              <div className="contact-note mb-10">
                <p className="font-medium">A note from us</p>
                <p className="mt-2 whitespace-pre-line">{application.decisionNote}</p>
              </div>
            )}
            <p className="apply-eb">
              Step {index + 1} of {ARTIST_STEPS.length}
            </p>
            <h2 className="apply-h2 outline-none" ref={heading} tabIndex={-1}>
              {meta.title}
            </h2>
            <p className="text-[1.1875rem]">{meta.intro}</p>

            <div className="mt-9">
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

            <div className="apply-actions mt-12">
              <button className="house-btn" disabled={busy} type="submit">
                {busy ? 'Saving…' : step === 'review' ? 'Send my application' : 'Save and continue'}
              </button>
              {step !== 'review' && (
                <button className="apply-btn2" disabled={busy} onClick={saveForLater} type="button">
                  Save and finish later
                </button>
              )}
              {back}
            </div>
            {step === 'review' && (
              <p className="muted mt-4 text-base">
                Once it is sent, you can follow it from your account.
              </p>
            )}
            {saved && (
              <p className="mt-6 text-base text-primary" role="status">
                Saved. You can close this page and come back to it by signing in.
              </p>
            )}
          </form>
        </div>
      </section>
    </>
  )
}

/** Whether the wait before applying again has passed; read once per render */
const waitIsOver = (iso?: string | null) => Boolean(iso) && new Date(iso!).getTime() <= Date.now()

/**
 * A declined application. Once the wait is over, "Apply again" reopens it: the same reference,
 * the first three steps filled in to review, the work and identity to add afresh.
 */
