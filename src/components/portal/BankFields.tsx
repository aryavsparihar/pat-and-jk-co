'use client'

import React, { useState } from 'react'

import { namesPlausiblyMatch } from '@/kyc/values'

import { api } from '../onboarding/api'
import { type Errors, fieldClass, TextField } from '../onboarding/fields'

export type BankValues = {
  holderName: string
  accountNumber: string
  accountNumberConfirm: string
  ifsc: string
  bankName: string
  branchName: string
  accountType: 'savings' | 'current'
}

export const emptyBank: BankValues = {
  holderName: '',
  accountNumber: '',
  accountNumberConfirm: '',
  ifsc: '',
  bankName: '',
  branchName: '',
  accountType: 'savings',
}

/**
 * Where we pay an artist: the account holder, the account number typed twice (pasting into the
 * second box is refused, to catch a slip), and the IFSC, which fills in the bank and branch. Used
 * only in the artist's account, after a fresh emailed code; bank details are never taken by email.
 */
export const BankFields: React.FC<{
  value: BankValues
  onChange: (next: BankValues) => void
  errors: Errors
  /** The artist's own name(s), to point out a holder name that looks different */
  names?: (string | null | undefined)[]
}> = ({ value, onChange, errors, names = [] }) => {
  const [lookup, setLookup] = useState<string | null>(null)
  const set = (key: keyof BankValues) => (x: string) => onChange({ ...value, [key]: x })

  const findBranch = async () => {
    const ifsc = value.ifsc.toUpperCase()
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return
    setLookup('Looking up the branch…')
    const result = await api<{
      found: boolean
      bank?: string
      branch?: string
      unavailable?: boolean
    }>('/next/members/kyc/ifsc', { body: { ifsc } })
    if (result.data.found) {
      onChange({
        ...value,
        bankName: result.data.bank ?? value.bankName,
        branchName: result.data.branch ?? value.branchName,
      })
      setLookup('Bank and branch filled in. Please check them.')
    } else {
      setLookup(
        result.data.unavailable
          ? 'We could not look that up just now; please type the bank and branch.'
          : 'We could not find that IFSC. Please check it.',
      )
    }
  }

  const known = names.filter((n): n is string => Boolean(n?.trim()))
  const mismatch =
    value.holderName.length > 2 &&
    known.length > 0 &&
    !known.some((n) => namesPlausiblyMatch(n, value.holderName))

  return (
    <div className="grid gap-y-8">
      <TextField
        autoComplete="off"
        errors={errors}
        hint="As the bank has it."
        label="Account holder’s name"
        name="holderName"
        onValue={set('holderName')}
        value={value.holderName}
      />
      {mismatch && (
        <p className="measure -mt-4 text-base italic" role="status">
          This name looks different from yours. That is fine for a joint account or a shortened
          name; otherwise, please check it.
        </p>
      )}
      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        <TextField
          autoComplete="off"
          errors={errors}
          inputMode="numeric"
          label="Account number"
          name="accountNumber"
          onValue={(x) => set('accountNumber')(x.replace(/\D/g, ''))}
          value={value.accountNumber}
        />
        <div>
          <label className="label mb-1 block" htmlFor="field-accountNumberConfirm">
            Account number again
          </label>
          <p className="muted mb-2 text-base" id="field-accountNumberConfirm-hint">
            Type it again rather than pasting, to catch a slip.
          </p>
          <input
            aria-describedby={[
              'field-accountNumberConfirm-hint',
              errors.accountNumberConfirm && 'field-accountNumberConfirm-error',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-invalid={errors.accountNumberConfirm ? true : undefined}
            autoComplete="off"
            className={fieldClass}
            id="field-accountNumberConfirm"
            inputMode="numeric"
            onChange={(e) => set('accountNumberConfirm')(e.target.value.replace(/\D/g, ''))}
            onDrop={(e) => e.preventDefault()}
            onPaste={(e) => e.preventDefault()}
            value={value.accountNumberConfirm}
          />
          {errors.accountNumberConfirm && (
            <p
              className="mt-2 text-base italic text-destructive"
              id="field-accountNumberConfirm-error"
            >
              {errors.accountNumberConfirm}
            </p>
          )}
        </div>
      </div>
      <TextField
        autoCapitalize="characters"
        autoComplete="off"
        className="max-w-sm"
        errors={errors}
        hint="Eleven characters, on your cheque book or passbook."
        label="IFSC"
        maxLength={11}
        name="ifsc"
        onBlur={findBranch}
        onValue={(x) => set('ifsc')(x.toUpperCase())}
        spellCheck={false}
        value={value.ifsc}
      />
      {lookup && (
        <p aria-live="polite" className="muted -mt-4 text-base" role="status">
          {lookup}
        </p>
      )}
      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        <TextField
          autoComplete="off"
          errors={errors}
          label="Bank"
          name="bankName"
          onValue={set('bankName')}
          value={value.bankName}
        />
        <TextField
          autoComplete="off"
          errors={errors}
          label="Branch"
          name="branchName"
          onValue={set('branchName')}
          value={value.branchName}
        />
      </div>
      <fieldset>
        <legend className="label mb-2">Account type</legend>
        {(['savings', 'current'] as const).map((type) => (
          <label className="mr-8 inline-flex min-h-11 cursor-pointer items-center gap-3" key={type}>
            <input
              checked={value.accountType === type}
              className="size-5 accent-[var(--primary)]"
              name="accountType"
              onChange={() => onChange({ ...value, accountType: type })}
              type="radio"
            />
            {type === 'savings' ? 'Savings' : 'Current'}
          </label>
        ))}
      </fieldset>
    </div>
  )
}
