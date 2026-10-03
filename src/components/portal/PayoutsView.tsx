'use client'

import React, { useState } from 'react'

import { api } from '../onboarding/api'
import { ErrorSummary, type Errors, fieldClass, TextField } from '../onboarding/fields'

export type MaskedKyc = {
  panMasked: string | null
  aadhaarMasked: string | null
  bank: { accountMasked: string; ifscMasked: string; bankName: string; accountType: string }
  pendingBank: { accountMasked: string; bankName: string; requestedAt: string } | null
  verification: string
} | null

/**
 * Where we pay the artist, masked, and the way to change it: a fresh code to their email first,
 * then the new details, which our team checks before they replace the old ones. The old account
 * stays in use until then, and the artist is emailed a way to stop the change.
 */
export const PayoutsView: React.FC<{ kyc: MaskedKyc }> = ({ kyc }) => {
  const [stage, setStage] = useState<'view' | 'code' | 'details' | 'sent'>('view')
  const [challengeId, setChallengeId] = useState<number | null>(null)
  const [v, setV] = useState<Record<string, string>>({ accountType: 'savings' })
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (x: string) => setV((all) => ({ ...all, [k]: x }))

  if (!kyc) {
    return <p className="measure">We do not have your bank details yet. Please write to us.</p>
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
      body: {
        challengeId,
        code: v.code,
        bank: {
          holderName: v.holderName,
          accountNumber: v.accountNumber,
          accountNumberConfirm: v.accountNumberConfirm,
          ifsc: v.ifsc,
          bankName: v.bankName,
          branchName: v.branchName,
          accountType: v.accountType,
        },
      },
    })
    setBusy(false)
    if (!result.ok) {
      const flat: Errors = {}
      for (const [key, value] of Object.entries(result.data.errors ?? {}))
        flat[key.replace(/^bank\./, '')] = value
      setErrors(flat)
      if (!result.data.errors) setMessage(result.data.message ?? 'The change could not be sent.')
      return
    }
    setV({ accountType: 'savings' })
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
          <span className="tracking-wider">{kyc.bank.accountMasked}</span>, {kyc.bank.bankName} (
          {kyc.bank.accountType})
        </dd>
      </dl>

      {kyc.pendingBank && stage !== 'sent' && (
        <p
          className="measure mt-8 border-l-2 border-primary bg-surface py-4 pl-6 pr-4"
          role="status"
        >
          A change to {kyc.pendingBank.accountMasked}, {kyc.pendingBank.bankName}, is waiting for
          our team to check it. Until then we keep paying into the account above.
        </p>
      )}

      {stage === 'view' && !kyc.pendingBank && (
        <div className="mt-10">
          <button
            className="btn btn-outline min-h-11"
            disabled={busy}
            onClick={askForCode}
            type="button"
          >
            {busy ? 'Sending a code…' : 'Change where we pay you'}
          </button>
          <p className="muted measure mt-3 text-base">
            To keep your payments safe, we first send a code to your email, even though you are
            signed in.
          </p>
        </div>
      )}

      {stage === 'details' && (
        <form className="mt-10" noValidate onSubmit={send}>
          <p className="measure mb-8">
            We have emailed you a code. Enter it with your new bank details. Our team checks them
            before they are used, and we email you a way to stop the change if it was not you.
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
              onValue={(x) => set('code')(x.replace(/\D/g, ''))}
              value={v.code ?? ''}
            />
            <TextField
              autoComplete="off"
              errors={errors}
              label="Account holder’s name"
              name="holderName"
              onValue={set('holderName')}
              value={v.holderName ?? ''}
            />
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              <TextField
                autoComplete="off"
                errors={errors}
                inputMode="numeric"
                label="Account number"
                name="accountNumber"
                onValue={(x) => set('accountNumber')(x.replace(/\D/g, ''))}
                value={v.accountNumber ?? ''}
              />
              <div>
                <label className="label mb-1 block" htmlFor="field-accountNumberConfirm">
                  Account number again
                </label>
                <input
                  autoComplete="off"
                  className={fieldClass}
                  id="field-accountNumberConfirm"
                  inputMode="numeric"
                  onChange={(e) => set('accountNumberConfirm')(e.target.value.replace(/\D/g, ''))}
                  onDrop={(e) => e.preventDefault()}
                  onPaste={(e) => e.preventDefault()}
                  value={v.accountNumberConfirm ?? ''}
                />
                {errors.accountNumberConfirm && (
                  <p className="mt-2 text-base italic text-destructive">
                    {errors.accountNumberConfirm}
                  </p>
                )}
              </div>
            </div>
            <TextField
              autoComplete="off"
              className="max-w-sm"
              errors={errors}
              label="IFSC"
              maxLength={11}
              name="ifsc"
              onValue={(x) => set('ifsc')(x.toUpperCase())}
              value={v.ifsc ?? ''}
            />
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              <TextField
                errors={errors}
                label="Bank"
                name="bankName"
                onValue={set('bankName')}
                value={v.bankName ?? ''}
              />
              <TextField
                errors={errors}
                label="Branch"
                name="branchName"
                onValue={set('branchName')}
                value={v.branchName ?? ''}
              />
            </div>
            <fieldset>
              <legend className="label mb-2">Account type</legend>
              {(['savings', 'current'] as const).map((type) => (
                <label
                  className="mr-8 inline-flex min-h-11 cursor-pointer items-center gap-3"
                  key={type}
                >
                  <input
                    checked={v.accountType === type}
                    className="size-5 accent-[var(--primary)]"
                    name="accountType"
                    onChange={() => set('accountType')(type)}
                    type="radio"
                  />
                  {type === 'savings' ? 'Savings' : 'Current'}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <button className="btn btn-solid min-h-11" disabled={busy} type="submit">
              {busy ? 'Sending…' : 'Send the new details'}
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
          Thank you. Our team will check the new details before we use them. Until then we keep
          paying into your current account. We have emailed you about the change.
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
