'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { api } from '../onboarding/api'
import { ErrorSummary, type Errors, TextField } from '../onboarding/fields'
import { useStepUp } from '../onboarding/StepUp'
import { BankFields, type BankValues, emptyBank } from './BankFields'

export type MaskedKyc = {
  panMasked: string | null
  aadhaarMasked: string | null
  bank: { accountMasked: string; ifscMasked: string; bankName: string; accountType: string } | null
  pendingBank: { accountMasked: string; bankName: string; requestedAt: string } | null
  payoutRequestedAt: string | null
  verification: string
} | null

/**
 * Where we pay the artist, masked, and the one way to add or change it. Bank details are asked for
 * only when a sale needs a payout, and only here: a fresh code to their email first, then the
 * details, which our team checks with a ₹1 test transfer before using them. Any old account stays
 * in use until then, and the artist is emailed a way to stop it. Never by email.
 */
export const PayoutsView: React.FC<{ kyc: MaskedKyc; locked?: boolean }> = ({ kyc, locked }) => {
  const { confirm } = useStepUp()
  const router = useRouter()
  const [stage, setStage] = useState<'view' | 'details' | 'sent'>('view')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [bank, setBank] = useState<BankValues>(emptyBank)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!kyc) {
    return (
      <p className="measure">
        We do not have your identity details yet, so we cannot take payout details. Please write to
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
          Your payout details are hidden until you confirm it is you, as you signed in more than
          half an hour ago.
        </p>
        <button
          className="btn btn-solid mt-6 min-h-11"
          onClick={async () => {
            if (await confirm()) router.refresh()
          }}
          type="button"
        >
          Show my payout details
        </button>
      </div>
    )
  }

  const askForCode = async () => {
    setBusy(true)
    setMessage(null)
    const result = await api<{ challengeId: number }>('/next/members/step-up', { body: {} })
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'We could not send a code.')
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
      if (!result.data.errors) setMessage(result.data.message ?? 'The details could not be sent.')
      return
    }
    // Forget what was typed: from here on only the masked view is shown
    setBank(emptyBank)
    setCode('')
    setStage('sent')
  }

  return (
    <div>
      <dl className="grid gap-y-3 sm:grid-cols-[12rem_1fr]">
        <dt className="label pt-1">PAN</dt>
        <dd className="tracking-wider">{kyc.panMasked ?? '—'}</dd>
        {kyc.aadhaarMasked && (
          <>
            <dt className="label pt-1">Aadhaar</dt>
            <dd className="tracking-wider">{kyc.aadhaarMasked}</dd>
          </>
        )}
        <dt className="label pt-1">Paid into</dt>
        <dd>
          {kyc.bank ? (
            <>
              <span className="tracking-wider">{kyc.bank.accountMasked}</span>, {kyc.bank.bankName}{' '}
              ({kyc.bank.accountType})
            </>
          ) : (
            'No account yet'
          )}
        </dd>
      </dl>

      {first && !kyc.pendingBank && stage === 'view' && (
        <p className="measure mt-8">
          {kyc.payoutRequestedAt
            ? 'We are ready to pay you. Please add the bank account we should pay into.'
            : 'We ask for the account to pay into when one of your works sells. You can add it now, or when we ask.'}
        </p>
      )}

      {kyc.pendingBank && stage !== 'sent' && (
        <p
          className="measure mt-8 border-l-2 border-primary bg-surface py-4 pl-6 pr-4"
          role="status"
        >
          {first
            ? `Your account ${kyc.pendingBank.accountMasked}, ${kyc.pendingBank.bankName}, is waiting for our team to check it. We will send ₹1 to it first and ask you to confirm it arrived.`
            : `A change to ${kyc.pendingBank.accountMasked}, ${kyc.pendingBank.bankName}, is waiting for our team to check it. Until then we keep paying into the account above.`}
        </p>
      )}

      {stage === 'view' && !kyc.pendingBank && (
        <div className="mt-10">
          <button
            className={`btn ${first ? 'btn-solid' : 'btn-outline'} min-h-11`}
            disabled={busy}
            onClick={askForCode}
            type="button"
          >
            {busy ? 'Sending a code…' : first ? 'Add where we pay you' : 'Change where we pay you'}
          </button>
          <p className="muted measure mt-3 text-base">
            To keep your payments safe, we first send a code to your email, even though you are
            signed in. We never ask for bank details by email, and never send them.
          </p>
        </div>
      )}

      {stage === 'details' && (
        <form className="mt-10" noValidate onSubmit={send}>
          <p className="measure mb-8">
            We have emailed you a code. Enter it with your bank details. Our team checks them, with
            a ₹1 test payment, before they are used, and we email you a way to stop this if it was
            not you.
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
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <button className="btn btn-solid min-h-11" disabled={busy} type="submit">
              {busy ? 'Sending…' : first ? 'Send the details' : 'Send the new details'}
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
            ? 'Thank you. Our team will check the account, sending ₹1 to it first, before we use it. We have emailed you about it.'
            : 'Thank you. Our team will check the new details before we use them. Until then we keep paying into your current account. We have emailed you about the change.'}
        </p>
      )}

      {message && (
        <p className="mt-6 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
