'use client'

import React, { useState } from 'react'

import { COUNTRIES } from '@/forms/country/data'
import { namesPlausiblyMatch } from '@/kyc/values'

import { api } from '../onboarding/api'
import { type Errors, fieldClass, SelectField, TextArea, TextField } from '../onboarding/fields'

export type BankValues = {
  location: 'india' | 'abroad'
  holderName: string
  accountNumber: string
  accountNumberConfirm: string
  // In India
  ifsc: string
  bankName: string
  branchName: string
  accountType: 'savings' | 'current'
  // Outside India
  bankCountry: string
  swift: string
  bankAddress: string
  currency: string
}

export const emptyBank = (location: BankValues['location'] = 'india'): BankValues => ({
  location,
  holderName: '',
  accountNumber: '',
  accountNumberConfirm: '',
  ifsc: '',
  bankName: '',
  branchName: '',
  accountType: 'savings',
  bankCountry: '',
  swift: '',
  bankAddress: '',
  currency: '',
})

const ABROAD_COUNTRIES = COUNTRIES.filter((c) => c !== 'India')

/**
 * Where we pay an artist (the founder's AccountPayouts design): first where the bank is. In
 * India, the account holder, the account number typed twice (pasting into the second box is
 * refused, to catch a slip) and the IFSC, which fills in the bank and branch. Outside India, the
 * bank's country, the IBAN or account number (also typed twice), the SWIFT or BIC code, the
 * bank's name and branch address, and the currency. The account must be in the artist's own
 * name. Used only in the artist's account, after a fresh emailed code; never by email.
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
  const india = value.location === 'india'

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

  // In India only digits; abroad letters too (an IBAN), kept in capitals without spaces
  const tidyAccount = (x: string) =>
    india ? x.replace(/\D/g, '') : x.replace(/[^a-z0-9 ]/gi, '').toUpperCase()

  return (
    <div className="grid gap-y-8">
      <fieldset>
        <legend className="label mb-2">Where is your bank?</legend>
        {(
          [
            ['india', 'In India'],
            ['abroad', 'Outside India'],
          ] as const
        ).map(([location, label]) => (
          <label
            className="mr-8 inline-flex min-h-11 cursor-pointer items-center gap-3"
            key={location}
          >
            <input
              checked={value.location === location}
              className="size-5 accent-[var(--primary)]"
              name="location"
              onChange={() => {
                setLookup(null)
                // The other kind's numbers never carry across
                onChange({ ...emptyBank(location), holderName: value.holderName })
              }}
              type="radio"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <TextField
        autoComplete="off"
        errors={errors}
        hint="As the bank has it, and in your own name: we can’t pay into anyone else’s account."
        label="Account holder’s name"
        name="holderName"
        onValue={set('holderName')}
        value={value.holderName}
      />
      {mismatch && (
        <p className="measure -mt-4 text-base italic" role="status">
          This name looks different from the one on your ID. The account must be in your own name;
          a shortened name is fine.
        </p>
      )}

      {!india && (
        <SelectField
          className="max-w-sm"
          errors={errors}
          label="Bank’s country"
          name="bankCountry"
          onValue={set('bankCountry')}
          options={ABROAD_COUNTRIES}
          value={value.bankCountry}
        />
      )}

      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        <TextField
          autoCapitalize={india ? undefined : 'characters'}
          autoComplete="off"
          errors={errors}
          hint={india ? undefined : 'An IBAN where your country uses one.'}
          inputMode={india ? 'numeric' : 'text'}
          label={india ? 'Account number' : 'IBAN or account number'}
          name="accountNumber"
          onValue={(x) => set('accountNumber')(tidyAccount(x))}
          spellCheck={false}
          value={value.accountNumber}
        />
        <div>
          <label className="label mb-1 block" htmlFor="field-accountNumberConfirm">
            {india ? 'Account number again' : 'IBAN or account number again'}
          </label>
          <p className="muted mb-2 text-base" id="field-accountNumberConfirm-hint">
            Please type it rather than paste it.
          </p>
          <input
            aria-describedby={[
              'field-accountNumberConfirm-hint',
              errors.accountNumberConfirm && 'field-accountNumberConfirm-error',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-invalid={errors.accountNumberConfirm ? true : undefined}
            autoCapitalize={india ? undefined : 'characters'}
            autoComplete="off"
            className={fieldClass}
            id="field-accountNumberConfirm"
            inputMode={india ? 'numeric' : 'text'}
            onChange={(e) => set('accountNumberConfirm')(tidyAccount(e.target.value))}
            onDrop={(e) => e.preventDefault()}
            onPaste={(e) => e.preventDefault()}
            spellCheck={false}
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

      {india ? (
        <>
          <TextField
            autoCapitalize="characters"
            autoComplete="off"
            className="max-w-sm"
            errors={errors}
            hint="Eleven characters, printed on your cheque book or passbook."
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
              <label
                className="mr-8 inline-flex min-h-11 cursor-pointer items-center gap-3"
                key={type}
              >
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
        </>
      ) : (
        <>
          <TextField
            autoCapitalize="characters"
            autoComplete="off"
            className="max-w-sm"
            errors={errors}
            hint="Eight or eleven characters."
            label="SWIFT or BIC code"
            maxLength={11}
            name="swift"
            onValue={(x) => set('swift')(x.replace(/[^a-z0-9]/gi, '').toUpperCase())}
            spellCheck={false}
            value={value.swift}
          />
          <TextArea
            errors={errors}
            label="Bank’s name and branch address"
            limit={300}
            name="bankAddress"
            onValue={set('bankAddress')}
            rows={3}
            value={value.bankAddress}
          />
          <TextField
            autoCapitalize="characters"
            autoComplete="off"
            className="max-w-xs"
            errors={errors}
            label="Account’s currency"
            maxLength={3}
            name="currency"
            onValue={(x) => set('currency')(x.replace(/[^a-z]/gi, '').toUpperCase())}
            placeholder="For example, GBP"
            spellCheck={false}
            value={value.currency}
          />
          <p className="muted measure -mt-2 text-base">
            Payment is sent by international transfer. Your bank, and any bank in between, may
            charge a fee to receive it.
          </p>
        </>
      )}
    </div>
  )
}
