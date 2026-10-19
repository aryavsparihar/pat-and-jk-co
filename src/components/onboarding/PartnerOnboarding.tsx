'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { ApplyAgainButton } from '@/components/account/ApplicationActions'
import { BotCheckHelp } from '@/components/turnstile/BotCheckHelp'
import { useVisibleTurnstile } from '@/components/turnstile/useTurnstile'
import { DeclinedNotice } from './DeclinedNotice'

import { PARTNER_CATEGORIES } from '@/members/categories'
import { STATES_AND_TERRITORIES } from '@/members/forms/india'
import { PARTNER_SUBTYPES } from '@/members/forms/schemas'
import type { Application } from '@/payload-types'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'
import { TURNSTILE_FIELD } from '@/security/turnstile'

import { api } from './api'
import { IdentityPhoto, NAME_CHANGED } from './artist/identity/IdentityPhoto'
import { Lock } from './artist/identity/Lock'
import { PrivacyConsent } from './artist/identity/PrivacyConsent'
import { AGREE_PHRASE, ReadToAgree } from './artist/identity/ReadToAgree'
import { Upload } from './artist/identity/Upload'
import { CodeSignIn } from './CodeSignIn'
import { ErrorSummary, type Errors, SelectField, TextArea, TextField } from './fields'
import { StepUpProvider, useStepUp } from './StepUp'

type Values = Record<string, string | undefined>

/** Whether the wait before applying again has passed; read once per render */
const waitIsOver = (iso?: string | null) => Boolean(iso) && new Date(iso!).getTime() <= Date.now()

/** What a partner sees of identity details already given: masks only */
type MaskedKyc = { panMasked: string | null; documents: { id: number; kind: string }[] } | null

/** Given before, and complete for a partner: the PAN, its card and the photo */
const partnerKycComplete = (kyc: MaskedKyc) =>
  Boolean(
    kyc?.panMasked &&
    kyc.documents.some((d) => d.kind === 'pan-card') &&
    kyc.documents.some((d) => d.kind === 'identity-photo'),
  )

type Props = {
  formToken: string
  initialCategory?: string
  /** The privacy policy, rendered on the server, for the identity consent */
  privacy: React.ReactNode
  /** The Partner/Trade Program agreement while published in Site settings; until then, none */
  agreement: { title: string; version: string; body: React.ReactNode } | null
}

/**
 * The partner application: an email check, then one page. Their details; their identity (a PAN,
 * the card, and a photo holding a ten-minute code and their name), as for an artist but with no
 * second ID, address or bank details; agreement to the Partner/Trade Program, read to its end;
 * and the bot check before it is sent. Identity details need a recent sign-in, which the page
 * asks for when it is due (StepUp).
 */
export const PartnerOnboarding: React.FC<Props> = (props) => (
  <StepUpProvider>
    <PartnerForm {...props} />
  </StepUpProvider>
)

const PartnerForm: React.FC<Props> = ({ formToken, initialCategory, privacy, agreement }) => {
  const [phase, setPhase] = useState<'loading' | 'signin' | 'form' | 'closed' | 'sent'>('loading')
  const [application, setApplication] = useState<Application | null>(null)
  const [values, setValues] = useState<Values>({ category: initialCategory })
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState('')
  const [honeypot, setHoneypot] = useState('')
  // Identity: what was given before (masked), and what is typed now. Nothing typed is ever put
  // in browser storage, and only masks come back from the server
  const [kyc, setKyc] = useState<MaskedKyc | undefined>(undefined)
  const [noticeVersion, setNoticeVersion] = useState<string | undefined>(undefined)
  const [editingKyc, setEditingKyc] = useState(true)
  const [pan, setPan] = useState('')
  const [panName, setPanName] = useState('')
  const [docs, setDocs] = useState<{ 'pan-card'?: number; 'identity-photo'?: number }>({})
  const [photo, setPhoto] = useState<{ key: number; for: string | null; note: string | null }>({
    key: 0,
    for: null,
    note: null,
  })
  const [consented, setConsented] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [refused, setRefused] = useState(false)
  const bot = useVisibleTurnstile('partner-submit')
  const { guard } = useStepUp()

  type Loaded =
    | { phase: 'signin' }
    | {
        phase: 'form' | 'closed'
        app: Application
        given?: { kyc: MaskedKyc; noticeVersion?: string }
      }

  const fetchState = useCallback(async (): Promise<Loaded> => {
    const session = await api<{ signedIn: boolean }>('/next/members/session')
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
    // Identity details given before, masked, for an application still open
    const given =
      app.stage === 'draft' || app.stage === 'changes-requested'
        ? (await api<{ kyc: MaskedKyc; noticeVersion?: string }>('/next/members/kyc')).data
        : undefined
    return {
      given,
      phase: app.stage === 'draft' || app.stage === 'changes-requested' ? 'form' : 'closed',
      app,
    }
  }, [])

  const apply = useCallback((loaded: Loaded) => {
    if (loaded.phase !== 'signin') {
      const { app, given } = loaded
      setApplication(app)
      if (given) {
        setKyc(given.kyc ?? null)
        setNoticeVersion(given.noticeVersion)
        setEditingKyc(!partnerKycComplete(given.kyc ?? null))
      }
      const saved = app.partner ?? {}
      setValues((v) => ({
        ...Object.fromEntries(Object.entries(saved).filter(([, x]) => typeof x === 'string')),
        category: app.partnerCategory ?? v.category,
      }))
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

  const set = (key: string) => (value: string) =>
    setValues((v) => ({
      ...v,
      [key]: value,
      ...(key === 'category' ? { subType: undefined } : {}),
    }))

  // The name is written on the paper in the photo: a different name means a new photo
  const changePanName = (value: string) => {
    setPanName(value)
    if (photo.for !== null && value.trim() !== photo.for) {
      setDocs(({ 'identity-photo': _photo, ...rest }) => rest)
      setPhoto((p) => ({ key: p.key + 1, for: null, note: NAME_CHANGED }))
    }
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    setRefused(false)
    const result = await guard(() =>
      api<{ reference: string; retryCheck?: boolean }>('/next/members/application/partner', {
        body: {
          data: values,
          // Left out when the details given before are kept
          kyc: editingKyc
            ? {
                consent: consented,
                consentReadToEnd: consented,
                consentTyped: consented ? AGREE_PHRASE : '',
                noticeVersion,
                pan,
                panName,
                documents: docs,
              }
            : undefined,
          agreement: {
            version: agreement?.version,
            readToEnd: agreed,
            typed: agreed ? AGREE_PHRASE : '',
          },
          formToken,
          [HONEYPOT_FIELD]: honeypot,
          [TURNSTILE_FIELD]: bot.token,
        },
      }),
    )
    // A token is good for one request: the check runs again for the next
    bot.reset()
    setBusy(false)
    if (!result.ok && result.data.retryCheck) return setRefused(true)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      if (!result.data.errors)
        setMessage(result.data.message ?? 'Your application could not be sent.')
      return
    }
    setReference(result.data.reference)
    setPhase('sent')
    window.scrollTo({ top: 0 })
  }

  if (phase === 'loading')
    return (
      <p className="muted" role="status">
        One moment…
      </p>
    )
  if (phase === 'signin')
    return <CodeSignIn formToken={formToken} onSignedIn={load} purpose="apply-partner" />

  if (phase === 'closed' && application?.stage === 'rejected') {
    return (
      <DeclinedNotice
        action={
          waitIsOver(application.reapplyFrom) ? <ApplyAgainButton kind="partner" /> : undefined
        }
        kind="partner"
        note={application.decisionNote}
        reapplyFrom={application.reapplyFrom}
        ready={waitIsOver(application.reapplyFrom)}
        reference={application.reference}
        socials={[]}
      />
    )
  }
  if (phase === 'closed' && application?.stage === 'withdrawn') {
    return (
      <div>
        <p className="label">Application {application.reference}</p>
        <h2 className="display-md mt-3">You withdrew this application.</h2>
        <p className="lede measure mt-6">
          You are welcome to write to us again whenever you like. A new application starts with your
          answers filled in.
        </p>
        <div className="mt-10">
          <ApplyAgainButton kind="partner" />
        </div>
      </div>
    )
  }

  if (phase === 'sent' || phase === 'closed') {
    return (
      <div role="status">
        <h2 className="display-md">
          {phase === 'sent'
            ? 'Thank you. We will be in touch.'
            : application?.stage === 'approved'
              ? 'Your application has been approved. Welcome.'
              : 'We have your application.'}
        </h2>
        <p className="lede measure mt-6">
          Your reference is{' '}
          <strong className="tracking-wider">{reference || application?.reference}</strong>.
        </p>
        <a className="btn btn-solid mt-10 min-h-11" href="/account">
          Your account
        </a>
      </div>
    )
  }

  const subtypes = values.category
    ? (PARTNER_SUBTYPES[values.category as keyof typeof PARTNER_SUBTYPES] ?? [])
    : []

  return (
    <form noValidate onSubmit={send}>
      {application?.stage === 'changes-requested' && application.decisionNote && (
        <div className="mb-10 border-l-2 border-primary bg-surface py-5 pl-6 pr-4">
          <p className="font-medium">A note from us</p>
          <p className="measure mt-2 whitespace-pre-line">{application.decisionNote}</p>
        </div>
      )}
      <ErrorSummary errors={errors} />
      {message && (
        <p className="mb-8 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}

      <div className="grid gap-y-9">
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          <SelectField
            errors={errors}
            label="How would you like to work with us?"
            name="category"
            onValue={set('category')}
            options={PARTNER_CATEGORIES}
            value={values.category}
          />
          <SelectField
            errors={errors}
            label="What describes you best?"
            name="subType"
            onValue={set('subType')}
            options={subtypes}
            placeholder={values.category ? 'Please choose…' : 'Choose the first question first'}
            value={values.subType}
          />
        </div>
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
            value={values.role}
          />
        </div>
        <TextField
          autoComplete="organization"
          errors={errors}
          hint="Leave it empty if you work on your own."
          label="Organisation"
          name="organisation"
          onValue={set('organisation')}
          optional
          value={values.organisation}
        />
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          <TextField
            autoComplete="tel"
            errors={errors}
            hint="An Indian number on its own is fine; otherwise include the country code."
            inputMode="tel"
            label="Phone"
            name="phone"
            onValue={set('phone')}
            type="tel"
            value={values.phone}
          />
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
        </div>
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          <TextField
            autoComplete="address-level2"
            errors={errors}
            label="City"
            name="city"
            onValue={set('city')}
            value={values.city}
          />
          <SelectField
            errors={errors}
            label="State or union territory"
            name="state"
            onValue={set('state')}
            options={STATES_AND_TERRITORIES}
            value={values.state}
          />
        </div>
        <TextField
          className="max-w-md"
          errors={errors}
          hint="If your business is registered for GST. Fifteen characters."
          label="GSTIN"
          maxLength={15}
          name="gstin"
          onValue={(v) => set('gstin')(v.toUpperCase())}
          optional
          value={values.gstin}
        />
        <TextArea
          errors={errors}
          label="What would you like to do together?"
          limit={600}
          name="interest"
          onValue={set('interest')}
          rows={3}
          value={values.interest}
        />
        <TextArea
          errors={errors}
          hint="A little about you and your work."
          label="Message"
          limit={2000}
          name="message"
          onValue={set('message')}
          rows={6}
          value={values.message}
        />
      </div>

      <section aria-labelledby="partner-identity" className="mt-16 border-t border-border pt-10">
        <h2 className="display-sm" id="partner-identity">
          Your identity
        </h2>
        <div className="mb-10 mt-6 flex gap-4 bg-surface p-6">
          <Lock />
          <div className="measure grid gap-y-3">
            <p>
              <strong className="font-medium">Why we ask.</strong> To be sure of who we work with,
              as we are for every artist. We never ask a partner for bank details.
            </p>
            <p>
              <strong className="font-medium">How it is kept.</strong> Your details are encrypted
              the moment they reach us, and documents are encrypted before they are stored. We show
              them back to you only in part.
            </p>
            <p>
              <strong className="font-medium">Who sees them.</strong> Only the few people at PJK who
              check them, and every time they look it is recorded. We never sell or share them.
            </p>
          </div>
        </div>
        {errors.kyc && (
          <p className="mb-6 text-base italic text-destructive" id="field-kyc">
            {errors.kyc}
          </p>
        )}

        {!editingKyc && kyc ? (
          <div>
            <dl className="grid gap-y-3 sm:grid-cols-[12rem_1fr]">
              <dt className="label pt-1">PAN</dt>
              <dd className="tracking-wider">{kyc.panMasked}</dd>
              <dt className="label pt-1">Documents</dt>
              <dd>PAN card, and the photo of you</dd>
            </dl>
            <button
              className="link link-caps mt-6 min-h-11"
              onClick={() => setEditingKyc(true)}
              type="button"
            >
              Change these details
            </button>
          </div>
        ) : (
          <div className="grid gap-y-9">
            <TextField
              autoCapitalize="characters"
              autoComplete="off"
              className="max-w-md"
              errors={errors}
              hint="Ten characters, e.g. ABCPE1234F. Your own, personal PAN."
              label="PAN"
              maxLength={10}
              name="pan"
              onValue={(x) => setPan(x.toUpperCase())}
              spellCheck={false}
              value={pan}
            />
            <TextField
              autoComplete="off"
              errors={errors}
              hint="Exactly as it is printed on the card."
              label="Name as on your PAN"
              name="panName"
              onValue={changePanName}
              value={panName}
            />
            <Upload
              error={errors['documents.pan-card']}
              hint="A clear photo of the front of your PAN card, or your e-PAN. Your face in the card's photograph must be easy to see, and so must your name and number. We compare the face with the photo of you below."
              kind="pan-card"
              onUploaded={(id) => setDocs((d) => ({ ...d, 'pan-card': id }))}
              type="partner"
              value={docs['pan-card']}
            />

            <fieldset className="grid gap-y-6" id="field-documents-identity-photo">
              <legend className="label mb-2">A photo of you</legend>
              <p className="measure">
                So we know a real person is applying, and that it is you. We give you a code that
                lasts ten minutes. On a sheet of paper, write the code and your full name as it is
                on your PAN. Then take a photo of yourself holding the paper beside your face.
              </p>
              <ul className="measure grid list-disc gap-2 pl-6 text-base">
                <li>Write clearly, in capitals, large enough to read in the photo.</li>
                <li>Good light on your face. No sunglasses, cap or mask.</li>
                <li>Only the code is timed. Take as long as you need over the rest of the form.</li>
              </ul>
              <IdentityPhoto
                error={errors['documents.identity-photo']}
                key={photo.key}
                name={panName}
                note={photo.note}
                onSent={(id, name) => {
                  setDocs((d) => ({ ...d, 'identity-photo': id }))
                  setPhoto((p) => ({ ...p, for: name }))
                }}
                type="partner"
              />
            </fieldset>

            <PrivacyConsent
              agreed={consented}
              error={errors.consent ?? errors.consentReadToEnd ?? errors.consentTyped}
              onAgreed={setConsented}
              privacy={privacy}
            />
            {kyc && partnerKycComplete(kyc) && (
              <button
                className="link link-caps min-h-11 justify-self-start"
                onClick={() => setEditingKyc(false)}
                type="button"
              >
                Keep the details I gave before
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="partner-agreement" className="mt-16 border-t border-border pt-10">
        <h2 className="display-sm" id="partner-agreement">
          {agreement?.title ?? 'Partner/Trade Program agreement'}
        </h2>
        {agreement ? (
          <>
            <p className="measure mt-4">
              The terms on which we work with partners. Please read them to the end before you send
              your application.
            </p>
            <ReadToAgree
              agreed={agreed}
              body={agreement.body}
              documentName="the agreement"
              error={errors.agreement}
              id="agreement"
              label={<>I have read the {agreement.title} and I agree to it.</>}
              onAgreed={setAgreed}
              title={agreement.title}
            />
          </>
        ) : (
          <p
            className="measure mt-6 border-l-2 border-warning bg-surface py-5 pl-6 pr-4"
            id="field-agreement"
            role="status"
          >
            The agreement is being finalised. You can fill in everything above, but applications
            cannot be sent until it is published here. Please come back in a little while.
          </p>
        )}
      </section>

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

      <div className="mt-14 border-t border-border pt-8">
        <div className="max-w-md">{bot.element}</div>
        {(bot.problem ?? (refused ? 'failed' : null)) && (
          <BotCheckHelp problem={bot.problem ?? 'failed'} />
        )}
        <button
          className="btn btn-solid mt-6 min-h-11"
          disabled={busy || !agreement || (bot.enabled && !bot.token)}
          type="submit"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
