'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { api } from '../onboarding/api'
import { ErrorSummary, type Errors, TextField } from '../onboarding/fields'
import { useStepUp } from '../onboarding/StepUp'
import { BankFields, type BankValues, emptyBank } from './BankFields'

type Location = 'india' | 'abroad'

export type MaskedKyc = {
  panMasked: string | null
  passportMasked: string | null
  bank: {
    accountMasked: string
    ifscMasked: string
    bankName: string
    accountType: string | null
    location: Location
    country: string | null
    currency: string | null
  } | null
  pendingBank: {
    accountMasked: string
    bankName: string
    location: Location
    requestedAt: string
  } | null
  payoutRequestedAt: string | null
  verification: string
} | null

/** Only a bank in India is checked with a ₹1 test payment (the founder's design) */
const testNote = (location: Location) =>
  location === 'india' ? ' with a small test payment of ₹1' : ''

/**
 * Where we pay the artist, masked, and the one way to add or change it (the founder's
 * AccountPayouts design). Bank details are asked for when a sale needs a payout, and only here: a
 * fresh code to their email first, then the details, which our team checks before using them.
 * Any old account stays in use until then, and the artist is emailed a way to stop it. Never by
 * email.
 */
export const PayoutsView: React.FC<{ kyc: MaskedKyc; locked?: boolean; email: string }> = ({
  kyc,
  locked,
  email,
}) => {
  const { confirm } = useStepUp()
  const router = useRouter()
  // Someone who confirmed who they are with a passport most likely banks outside India
  const usual: Location = kyc?.passportMasked && !kyc.panMasked ? 'abroad' : 'india'
  const [stage, setStage] = useState<'view' | 'details' | 'sent'>('view')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [bank, setBank] = useState<BankValues>(() => emptyBank(usual))
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!kyc) {
    return (
      <p className="measure">
        We do not have your identity details yet, so we cannot take bank details. Please write to
        us.
      </p>
    )
  }
  const first = !kyc.bank

  // Signed in more than half an hour ago: the account is hidden until they confirm it is them
  if (locked) {
    return (
      <div>
        <p className="measure">
          Your bank details are hidden until you confirm it is you, as you signed in more than half
          an hour ago.
        </p>
        <button
          className="btn btn-solid mt-6 min-h-11"
          onClick={async () => {
            if (await confirm()) router.refresh()
          }}
          type="button"
        >
          Show my bank details
        </button>
      </div>
    )
  }

  const askForCode = async () => {
    setBusy(true)
    setMessage(null)
    const result = await api<{ challengeId: number }>('/next/members/step-up', { body: {} })
    setBusy(false)
    if (!result.ok)
      return setMessage(
        result.data.message ?? 'We could not send a code. Please try again in a few minutes.',
      )
    setChallengeId(result.data.challengeId)
    setStage('details')
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    const result = await api('/next/members/kyc/bank-change', {
      body: { challengeId, code, bank },
    })
    setBusy(false)
    if (!result.ok) {
      const flat: Errors = {}
      for (const [key, value] of Object.entries(result.data.errors ?? {}))
        flat[key.replace(/^bank\./, '')] = value
      setErrors(flat)
      if (!result.data.errors)
        setMessage(result.data.message ?? 'Your bank details could not be sent. Please try again.')
      return
    }
    // Forget what was typed: from here on only the masked view is shown
    setBank(emptyBank(usual))
    setCode('')
    setStage('sent')
  }

  const where = (b: { bankName: string; location: Location; country?: string | null }) =>
    b.location === 'abroad' && b.country ? `${b.bankName}, ${b.country}` : b.bankName

  return (
    <div>
      <dl className="grid gap-y-3 sm:grid-cols-[12rem_1fr]">
        <dt className="label pt-1">{kyc.panMasked ? 'PAN' : 'Passport'}</dt>
        <dd className="tracking-wider">{kyc.panMasked ?? kyc.passportMasked ?? '—'}</dd>
        <dt className="label pt-1">Bank account</dt>
        <dd>
          {kyc.bank ? (
            <>
              <span className="tracking-wider">{kyc.bank.accountMasked}</span>, {where(kyc.bank)}
              {kyc.bank.accountType ? ` (${kyc.bank.accountType})` : ''}
              {kyc.bank.location === 'abroad' && kyc.bank.currency
                ? `, in ${kyc.bank.currency}`
                : ''}
            </>
          ) : (
            'Not added yet'
          )}
        </dd>
      </dl>

      {first && !kyc.pendingBank && stage === 'view' && (
        <p className="measure mt-8">
          {kyc.payoutRequestedAt
            ? 'One of your works has sold. Please add the bank account we should pay into.'
            : 'We ask for your bank details when one of your works sells. You can add them now if you prefer.'}
        </p>
      )}

      {kyc.pendingBank && stage !== 'sent' && (
        <p
          className="measure mt-8 border-l-2 border-primary bg-surface py-4 pl-6 pr-4"
          role="status"
        >
          {first
            ? `Your account ${kyc.pendingBank.accountMasked}, ${kyc.pendingBank.bankName}, is waiting for our team to check it${testNote(kyc.pendingBank.location)}.`
            : `A change to ${kyc.pendingBank.accountMasked}, ${kyc.pendingBank.bankName}, is waiting for our team to check it. Until then we keep paying into the account above.`}
        </p>
      )}

      {stage === 'view' && !kyc.pendingBank && (
        <div className="mt-6">
          <p className="muted measure mb-6 text-base">
            To keep your payments safe, we first email you a code, even though you are signed in. We
            never ask for bank details by email, and we never send them.
          </p>
          <button
            className={`btn ${first ? 'btn-solid' : 'btn-outline'} min-h-11`}
            disabled={busy}
            onClick={askForCode}
            type="button"
          >
            {busy
              ? 'Sending a code…'
              : first
                ? 'Add your bank details'
                : 'Change your bank details'}
          </button>
        </div>
      )}

      {stage === 'details' && (
        <form className="mt-10 border border-border p-6 sm:p-10" noValidate onSubmit={send}>
          <h2 className="display-sm mb-2">
            {first ? 'Add your bank details' : 'Change your bank details'}
          </h2>
          <p className="measure mb-8">
            We have emailed a code to {email}. Enter it below with your bank details.
          </p>
          <ErrorSummary errors={errors} />
          <div className="grid gap-y-8">
            <TextField
              autoComplete="one-time-code"
              className="max-w-xs"
              errors={errors}
              inputMode="numeric"
              label="Code from the email"
              maxLength={6}
              name="code"
              onValue={(x) => setCode(x.replace(/\D/g, ''))}
              value={code}
            />
            <BankFields errors={errors} onChange={setBank} value={bank} />
            <p className="muted measure text-base">
              Before we use the account, our team checks it{testNote(bank.location)}. We also email
              you, so that you can stop the change if it was not you.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <button className="btn btn-solid min-h-11" disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Save bank details'}
            </button>
            <button
              className="link link-caps min-h-11"
              onClick={() => setStage('view')}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {stage === 'sent' && (
        <p className="measure mt-8" role="status">
          {first
            ? 'Thank you. Our team will check the account before we use it. We have emailed you about it.'
            : 'Thank you. Our team will check the new details before we use them. Until then we keep paying into your current account. We have emailed you about the change.'}
        </p>
      )}

      {message && (
        <p className="mt-6 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}

      <section className="mt-16 border-t border-border pt-12">
        <h2 className="display-sm mb-3">Your payments</h2>
        <p className="measure muted">
          Nothing yet. Each payment will be listed here with its date, the work it was for, and a
          statement you can download.
        </p>
      </section>
    </div>
  )
}
