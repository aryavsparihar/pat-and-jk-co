'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { ApplyAgainButton } from '@/components/account/ApplicationActions'
import { DeclinedNotice } from './DeclinedNotice'

import { PARTNER_CATEGORIES } from '@/members/categories'
import { STATES_AND_TERRITORIES } from '@/members/forms/india'
import { PARTNER_SUBTYPES } from '@/members/forms/schemas'
import type { Application } from '@/payload-types'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

import { api } from './api'
import { CodeSignIn } from './CodeSignIn'
import { ErrorSummary, type Errors, SelectField, TextArea, TextField } from './fields'

type Values = Record<string, string | undefined>

/** Whether the wait before applying again has passed; read once per render */
const waitIsOver = (iso?: string | null) => Boolean(iso) && new Date(iso!).getTime() <= Date.now()

/**
 * The partner application: an email check, then one page. Shorter than the artist's, and with no
 * identity or bank details at all.
 */
export const PartnerOnboarding: React.FC<{ formToken: string; initialCategory?: string }> = ({
  formToken,
  initialCategory,
}) => {
  const [phase, setPhase] = useState<'loading' | 'signin' | 'form' | 'closed' | 'sent'>('loading')
  const [application, setApplication] = useState<Application | null>(null)
  const [values, setValues] = useState<Values>({ category: initialCategory })
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState('')
  const [honeypot, setHoneypot] = useState('')

  type Loaded = { phase: 'signin' } | { phase: 'form' | 'closed'; app: Application }

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
    return {
      phase: app.stage === 'draft' || app.stage === 'changes-requested' ? 'form' : 'closed',
      app,
    }
  }, [])

  const apply = useCallback((loaded: Loaded) => {
    if (loaded.phase !== 'signin') {
      const { app } = loaded
      setApplication(app)
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

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    const result = await api<{ reference: string }>('/next/members/application/partner', {
      body: { data: values, formToken, [HONEYPOT_FIELD]: honeypot },
    })
    setBusy(false)
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
        <button className="btn btn-solid min-h-11" disabled={busy} type="submit">
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
