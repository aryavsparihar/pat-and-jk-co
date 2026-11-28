'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { ApplyAgainButton } from '@/components/account/ApplicationActions'
import { BotCheckHelp } from '@/components/turnstile/BotCheckHelp'
import { useVisibleTurnstile } from '@/components/turnstile/useTurnstile'
import { INDIA } from '@/forms/country/rules'
import { TRADE_ACCURATE, TRADE_NOTICE } from '@/members/applicationNotice'
import { TRADE_ROLES } from '@/members/forms/schemas'
import type { Application } from '@/payload-types'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

import { api } from './api'
import { HowWeUseYourDetails } from './artist/steps'
import { CodeSignIn } from './CodeSignIn'
import { CountrySelect, PhoneField, RegionField } from './country'
import { DeclinedNotice } from './DeclinedNotice'
import {
  Check,
  ErrorSummary,
  type Errors,
  fieldClass,
  idFor,
  SelectField,
  TextArea,
  TextField,
} from './fields'

type Values = Record<string, string | undefined>

/** Whether the wait before applying again has passed; read once per render */
const waitIsOver = (iso?: string | null) => Boolean(iso) && new Date(iso!).getTime() <= Date.now()

const ROLE_OPTIONS = TRADE_ROLES.map((role) => ({ value: role, label: role }))

/** The tax number and proof of practice say different things in India and elsewhere */
const tradeCopy = (country: string | undefined) => {
  const india = (country || INDIA) === INDIA
  return india
    ? {
        taxLabel: 'GSTIN',
        taxHelp:
          'Fifteen characters, if your business is registered for GST. It must be on your invoices for you to claim input tax credit, and cannot be added once an invoice is filed.',
        taxMax: 15,
        proofHelp:
          'A Council of Architecture number, a business card, or a link to a recent project. It speeds up our review.',
      }
    : {
        taxLabel: 'Company registration or VAT number',
        taxHelp:
          'If your business has one. It goes on your invoices, and helps your customs agent when a work arrives.',
        taxMax: 30,
        proofHelp:
          'Membership of a professional body (for example RIBA, AIA or BIID), a business card, or a link to a recent project. It speeds up our review.',
      }
}

/** A section of the form: its small heading in the left column, the fields on the right */
const Part: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <section className="house-sec border-t border-[#e3cfa3]">
    <div className="house-lab">
      <p className="house-small">{label}</p>
    </div>
    <div className="house-con max-w-[780px]">{children}</div>
  </section>
)

const Hero: React.FC<{ reference?: string | null }> = ({ reference }) => (
  <section className="house-hero">
    <div className="house-lab">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="h-auto w-14" height={56} src="/brand/wreath.png" width={56} />
    </div>
    <div className="house-con max-w-[780px]">
      <p className="house-small">Trade partners</p>
      <h1 className="apply-h1">Apply for a trade account</h1>
      <p className="house-lead">
        For interior designers, architects, art advisers, dealers and hospitality specifiers who buy
        or specify art for their clients. Works bought through a registered trade account carry 10%
        trade pricing, and the account brings designer catalogues. When a project needs a curator’s
        eye, we offer that too, quoted separately. Buying for your own home, hotel or office? Trade
        accounts are for professionals, so please{' '}
        <a className="link" href="/contact?about=curatorial-collection">
          write to us about curatorial support instead.
        </a>
      </p>
      <p className="house-p mt-4">
        It takes about five minutes, and no identity documents are needed at this stage.
        {reference ? (
          <>
            {' '}
            Your application number is{' '}
            <strong className="font-medium tracking-wider">{reference}</strong>.
          </>
        ) : null}
      </p>
    </div>
  </section>
)

const Plain: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="house-sec border-t border-[#e3cfa3]">
    <div className="house-lab" />
    <div className="house-con max-w-[780px]">{children}</div>
  </section>
)

type Loaded =
  { phase: 'signin' } | { phase: 'form' | 'closed'; app: Application; email: string | null }

/**
 * The trade application (the ApplyPartner design): an email check, then one page. How the
 * details are used, agreed to with I AGREE typed; about them; their practice, with the tax number
 * and proof that suit their country; what they have in mind; and the statement that it is all
 * true, with the bot check, before it is sent. It can be saved and finished later. No identity
 * documents are asked for now: those come after approval, before the trade agreement.
 */
export const TradeApplication: React.FC<{ formToken: string }> = ({ formToken }) => {
  const [phase, setPhase] = useState<'loading' | 'signin' | 'form' | 'closed' | 'sent'>('loading')
  const [application, setApplication] = useState<Application | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [values, setValues] = useState<Values>({ country: INDIA })
  const [consent, setConsent] = useState(false)
  const [typed, setTyped] = useState('')
  const [accurate, setAccurate] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [refused, setRefused] = useState(false)
  const bot = useVisibleTurnstile('partner-submit')

  const fetchState = useCallback(async (): Promise<Loaded> => {
    const session = await api<{ signedIn: boolean; member?: { email?: string } }>(
      '/next/members/session',
    )
    if (!session.data.signedIn) return { phase: 'signin' }
    let result = await api<{ application: Application | null }>(
      '/next/members/application?type=partner',
    )
    if (result.ok && !result.data.application) {
      await api('/next/members/application/start', { body: { type: 'partner' } })
      result = await api<{ application: Application | null }>(
        '/next/members/application?type=partner',
      )
    }
    const app = result.data.application
    if (!app) return { phase: 'signin' }
    return {
      phase: app.stage === 'draft' || app.stage === 'changes-requested' ? 'form' : 'closed',
      app,
      email: session.data.member?.email ?? null,
    }
  }, [])

  const apply = useCallback((loaded: Loaded) => {
    if (loaded.phase !== 'signin') {
      setApplication(loaded.app)
      setEmail(loaded.email)
      const kept = Object.entries(loaded.app.partner ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
      )
      setValues((v) => ({ ...v, ...Object.fromEntries(kept) }))
    }
    setPhase(loaded.phase)
  }, [])

  const load = useCallback(() => fetchState().then(apply), [fetchState, apply])

  useEffect(() => {
    let current = true
    void fetchState().then((loaded) => {
      if (current) apply(loaded)
    })
    return () => {
      current = false
    }
  }, [fetchState, apply])

  const set = (key: string) => (value: string) => {
    setSaved(false)
    setValues((v) => ({
      ...v,
      [key]: value,
      // The region means something else in another country
      ...(key === 'country' && value !== v.country ? { state: undefined } : {}),
    }))
  }

  const saveForLater = async () => {
    setBusy(true)
    setMessage(null)
    const result = await api('/next/members/application/partner', {
      body: { save: true, data: values, formToken, [HONEYPOT_FIELD]: honeypot },
    })
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'It could not be saved just now.')
    setSaved(true)
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    setRefused(false)
    setSaved(false)
    const result = await api<{ reference: string; retryCheck?: boolean }>(
      '/next/members/application/partner',
      {
        body: {
          data: values,
          consent: { checked: consent, typed },
          accurate,
          formToken,
          [HONEYPOT_FIELD]: honeypot,
          [TURNSTILE_FIELD]: bot.token,
        },
      },
    )
    // A token is good for one request: the check runs again for the next
    bot.reset()
    setBusy(false)
    if (!result.ok && result.data.retryCheck) return setRefused(true)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      setMessage(result.data.message ?? 'Your application could not be sent.')
      window.scrollTo({ top: 0 })
      return
    }
    setPhase('sent')
    window.scrollTo({ top: 0 })
  }

  if (phase === 'loading' || phase === 'signin') {
    return (
      <>
        <Hero />
        <Plain>
          {phase === 'loading' ? (
            <p className="muted" role="status">
              One moment…
            </p>
          ) : (
            <CodeSignIn formToken={formToken} onSignedIn={load} purpose="apply-partner" />
          )}
        </Plain>
      </>
    )
  }

  if (phase === 'sent') {
    return (
      <section className="house-hero" role="status">
        <div className="house-lab">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="h-auto w-14" height={56} src="/brand/wreath.png" width={56} />
        </div>
        <div className="house-con max-w-[780px]">
          <p className="house-small">Trade partners</p>
          <h1 className="apply-h1">Thank you. Your application has reached us.</h1>
          <p className="house-lead">
            Your application number is{' '}
            <strong className="font-medium tracking-wider">{application?.reference}</strong>. We
            read every application ourselves and reply within seven days. If we go ahead, we will
            ask you to confirm who you are in your account, then send our trade agreement to read
            and sign online.
          </p>
          <a className="house-btn mt-10" href="/next/members/view?to=partner">
            Go to your account
          </a>
        </div>
      </section>
    )
  }

  if (phase === 'closed' && application) {
    const words: Record<string, string> = {
      submitted: 'We have your application and will look at it soon.',
      'under-review': 'We are looking at your application now.',
      approved: 'Your application has been approved. Welcome.',
    }
    let body: React.ReactNode
    if (application.stage === 'rejected') {
      const ready = waitIsOver(application.reapplyFrom)
      body = (
        <DeclinedNotice
          action={ready ? <ApplyAgainButton kind="partner" /> : undefined}
          kind="partner"
          note={application.decisionNote}
          reapplyFrom={application.reapplyFrom}
          ready={ready}
          reference={application.reference}
          socials={[]}
        />
      )
    } else if (application.stage === 'withdrawn') {
      body = (
        <>
          <p className="house-small">Application {application.reference}</p>
          <h2 className="apply-h2 mt-3">You withdrew this application.</h2>
          <p className="house-p mt-6">
            You are welcome to apply again whenever you like. A new application starts with your
            answers filled in, for you to check.
          </p>
          <div className="mt-10">
            <ApplyAgainButton kind="partner" />
          </div>
        </>
      )
    } else {
      body = (
        <>
          <p className="house-small">Application {application.reference}</p>
          <h2 className="apply-h2 mt-3">{words[application.stage] ?? 'Your application'}</h2>
          <a className="house-btn mt-10" href="/next/members/view?to=partner">
            Go to your account
          </a>
        </>
      )
    }
    return (
      <>
        <Hero />
        <Plain>{body}</Plain>
      </>
    )
  }

  const copy = tradeCopy(values.country)
  const agreeId = idFor('consentTyped')

  return (
    <>
      <Hero reference={application?.reference} />
      <form noValidate onSubmit={send}>
        {(message || Object.keys(errors).length > 0 || application?.decisionNote) && (
          <Plain>
            {application?.stage === 'changes-requested' && application.decisionNote && (
              <div className="contact-note mb-8">
                <p className="font-medium">A note from us</p>
                <p className="mt-2 whitespace-pre-line">{application.decisionNote}</p>
              </div>
            )}
            <ErrorSummary errors={errors} />
            {message && Object.keys(errors).length === 0 && (
              <p className="text-base italic text-destructive" role="alert">
                {message}
              </p>
            )}
          </Plain>
        )}

        <Part label="Before you begin">
          <HowWeUseYourDetails
            checked={consent}
            error={errors.consent}
            intro={null}
            name="consent"
            onValue={(v) => {
              setSaved(false)
              setConsent(v)
            }}
            rows={TRADE_NOTICE}
          >
            <div className="mt-6 max-w-xs">
              <label className="label mb-1 block" htmlFor={agreeId}>
                To confirm, type I AGREE
              </label>
              <p className="muted mb-2 text-base" id={`${agreeId}-hint`}>
                In capital letters.
              </p>
              <input
                aria-describedby={[`${agreeId}-hint`, errors.consentTyped && `${agreeId}-error`]
                  .filter(Boolean)
                  .join(' ')}
                aria-invalid={errors.consentTyped ? true : undefined}
                autoCapitalize="characters"
                autoComplete="off"
                className={`${fieldClass} tracking-wider`}
                id={agreeId}
                onChange={(e) => setTyped(e.target.value)}
                spellCheck={false}
                type="text"
                value={typed}
              />
              {errors.consentTyped && (
                <p className="mt-2 text-base italic text-destructive" id={`${agreeId}-error`}>
                  {errors.consentTyped}
                </p>
              )}
            </div>
          </HowWeUseYourDetails>
        </Part>

        <Part label="About you">
          <div className="grid gap-y-9">
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              <TextField
                autoComplete="name"
                errors={errors}
                label="Your full name"
                name="fullName"
                onValue={set('fullName')}
                value={values.fullName}
              />
              <TextField
                autoComplete="organization-title"
                errors={errors}
                label="Your role"
                name="role"
                onValue={set('role')}
                placeholder="For example, principal designer"
                value={values.role}
              />
            </div>
            <TextField
              autoComplete="organization"
              errors={errors}
              hint="Leave it empty if you work on your own."
              label="Firm or organisation"
              name="organisation"
              onValue={set('organisation')}
              optional
              value={values.organisation}
            />
            <PhoneField
              errors={errors}
              label="Phone"
              name="phone"
              onValue={set('phone')}
              value={values.phone}
            />
            {email && (
              <div>
                <p className="label mb-1">Email</p>
                <p className="break-words">{email}</p>
                <p className="muted mt-1 text-base">The address you signed in with.</p>
              </div>
            )}
          </div>
        </Part>

        <Part label="Your practice">
          <div className="grid gap-y-9">
            <SelectField
              className="max-w-md"
              errors={errors}
              label="Which describes you best?"
              name="subType"
              onValue={set('subType')}
              options={ROLE_OPTIONS}
              placeholder="Choose…"
              value={values.subType}
            />
            <CountrySelect
              errors={errors}
              name="country"
              onValue={set('country')}
              value={values.country}
            />
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              <TextField
                autoComplete="address-level2"
                errors={errors}
                label="City"
                name="city"
                onValue={set('city')}
                value={values.city}
              />
              <RegionField
                country={values.country}
                errors={errors}
                name="state"
                onValue={set('state')}
                value={values.state}
              />
            </div>
            <TextField
              autoComplete="url"
              errors={errors}
              label="Website or portfolio"
              name="website"
              onValue={set('website')}
              optional
              placeholder="https://"
              type="url"
              value={values.website}
            />
            <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
              <TextField
                autoCapitalize="characters"
                errors={errors}
                hint={copy.taxHelp}
                label={copy.taxLabel}
                maxLength={copy.taxMax}
                name="gstin"
                onValue={(v) => set('gstin')(v.toUpperCase())}
                optional
                spellCheck={false}
                value={values.gstin}
              />
              <TextField
                errors={errors}
                hint={copy.proofHelp}
                label="Proof of practice"
                name="proof"
                onValue={set('proof')}
                optional
                value={values.proof}
              />
            </div>
          </div>
        </Part>

        <Part label="What you have in mind">
          <div className="grid gap-y-9">
            <TextArea
              errors={errors}
              hint="For example, art for a hotel’s guest rooms, or regular work for your design projects."
              label="What would you like to do with us?"
              limit={600}
              name="interest"
              onValue={set('interest')}
              rows={3}
              value={values.interest}
            />
            <TextArea
              errors={errors}
              hint="A little about your practice and recent projects."
              label="Anything else"
              limit={2000}
              name="message"
              onValue={set('message')}
              optional
              rows={6}
              value={values.message}
            />
          </div>
        </Part>

        <Part label="Send">
          <Check
            checked={accurate}
            error={errors.accurate}
            label={TRADE_ACCURATE}
            name="accurate"
            onValue={setAccurate}
          />
          <p className="muted mt-6 text-base">
            Would you rather curate collections with us than buy for your projects?{' '}
            <a className="link" href="/collaborate/curators">
              Apply as a guest curator instead.
            </a>
          </p>

          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor={`${HONEYPOT_FIELD}-partner`}>Company website</label>
            <input
              autoComplete="off"
              id={`${HONEYPOT_FIELD}-partner`}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              value={honeypot}
            />
          </div>

          {bot.enabled && (
            <div className="mt-10">
              <p className="label mb-2">Security check</p>
              <div className="max-w-md">{bot.element}</div>
            </div>
          )}
          {(bot.problem ?? (refused ? 'failed' : null)) && (
            <BotCheckHelp problem={bot.problem ?? 'failed'} />
          )}

          <div className="apply-actions mt-10">
            <button
              className="house-btn"
              disabled={busy || (bot.enabled && !bot.token)}
              type="submit"
            >
              {busy ? 'Sending…' : 'Send my application'}
            </button>
            <button className="apply-btn2" disabled={busy} onClick={saveForLater} type="button">
              Save and finish later
            </button>
          </div>
          {saved && (
            <p className="mt-6 text-base text-primary" role="status">
              Saved. You can close this page and come back to it by signing in.
            </p>
          )}
        </Part>
      </form>
    </>
  )
}
