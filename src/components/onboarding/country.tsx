'use client'

import React, { useRef, useState } from 'react'

import { COUNTRIES, DIAL_CODES, INDIAN_STATES } from '@/forms/country/data'
import {
  ADDRESS_ERRORS,
  addressCopy,
  dialCode,
  dialLabel,
  INDIA,
  isIndia,
  PHONE_COPY,
  POSTAL_ADDRESS_COPY,
  splitPhone,
} from '@/forms/country/rules'
import { cn } from '@/utilities/ui'

import { api } from './api'
import { LocationPin } from './artist/LocationPin'
import { Check, type Errors, fieldClass, idFor, SelectField, TextArea, TextField } from './fields'

/**
 * The country-driven parts every form shares (the founder's brief, section 5): a country list
 * with India first, a phone number as a country code and a number, and an address written the
 * way its country writes one. The wording is the Apply2 design's; the rules behind it are in
 * src/forms/country/rules.ts, which the server checks with too.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- step values are free-form until the schema checks them */
type Values = Record<string, any>
type Setter = (path: string, value: unknown) => void

/** A small grey "(optional)" or "(recommended)" after a label */
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ml-2 normal-case tracking-normal text-muted-foreground">{children}</span>
)

export const CountrySelect: React.FC<{
  name: string
  value: string | undefined | null
  onValue: (value: string) => void
  errors: Errors
  hint?: string
  className?: string
}> = ({ name, value, onValue, errors, hint, className }) => (
  <SelectField
    className={cn('max-w-sm', className)}
    errors={errors}
    hint={hint}
    label="Country"
    name={name}
    onValue={onValue}
    options={COUNTRIES}
    placeholder="Choose…"
    value={value || INDIA}
  />
)

/**
 * "Choose the country code, then type the number." The picker starts on India. The value sent is
 * the code and the number together ("+44 7911 123456"), which the server turns into one
 * international number; the picker remembers the country chosen, so Canada stays Canada.
 */
export const PhoneField: React.FC<{
  name: string
  label: string
  value: string | undefined | null
  onValue: (value: string) => void
  errors: Errors
  className?: string
}> = ({ name, label, value, onValue, errors, className }) => {
  const saved = splitPhone(value)
  const [country, setCountry] = useState(saved?.country ?? INDIA)
  // A number saved before the picker had no code: it was Indian
  const number = saved ? saved.number : (value ?? '').replace(/^\+?91(?=\d{10}$)/, '')
  const send = (nextCountry: string, nextNumber: string) =>
    onValue(nextNumber.trim() ? `${dialCode(nextCountry) ?? ''} ${nextNumber}` : '')
  const id = idFor(name)
  const error = errors[name]
  return (
    <div className={cn('min-w-0 max-w-[480px]', className)}>
      <label className="label mb-1 block" htmlFor={id}>
        {label}
      </label>
      <p className="muted mb-2 text-base" id={`${id}-hint`}>
        {PHONE_COPY.hint}
      </p>
      <div className="flex items-end gap-3.5">
        <label className="sr-only" htmlFor={`${id}-code`}>
          {PHONE_COPY.codeLabel}
        </label>
        <select
          autoComplete="tel-country-code"
          className={cn(fieldClass, 'w-[170px] flex-none cursor-pointer')}
          id={`${id}-code`}
          onChange={(e) => {
            setCountry(e.target.value)
            send(e.target.value, number)
          }}
          value={country}
        >
          {DIAL_CODES.map((entry) => (
            <option key={entry.country} value={entry.country}>
              {dialLabel(entry)}
            </option>
          ))}
        </select>
        <input
          aria-describedby={[`${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          autoComplete="tel-national"
          className={cn(fieldClass, 'min-w-0 flex-1')}
          id={id}
          inputMode="tel"
          maxLength={20}
          name={name}
          onChange={(e) => send(country, e.target.value.replace(/[^\d\s()+-]/g, ''))}
          required
          type="tel"
          value={number}
        />
      </div>
      {error && (
        <p className="mt-2 text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

/** The region: India's states and union territories from a list, the country's own word elsewhere */
export const RegionField: React.FC<{
  name: string
  country: string | undefined
  value: string | undefined
  onValue: (value: string) => void
  errors: Errors
}> = ({ name, country, value, onValue, errors }) => {
  const copy = addressCopy(country)
  if (!copy.hasRegion) return null
  return copy.regionFromList ? (
    <SelectField
      errors={errors}
      label={copy.regionLabel}
      name={name}
      onValue={onValue}
      options={INDIAN_STATES}
      placeholder="Choose…"
      value={value}
    />
  ) : (
    <TextField
      autoComplete="address-level1"
      errors={errors}
      label={copy.regionLabel}
      name={name}
      onValue={onValue}
      optional={copy.regionOptional}
      value={value}
    />
  )
}

/** The parts whose meaning changes with the country, cleared when it changes */
const COUNTRY_BOUND = ['postalCode', 'district', 'state'] as const

/**
 * A home address in the order of the Apply2 design: the country first, then the postal code (or
 * the note where there are none), the house and street, area, landmark, town, the district in
 * India, the region, and the map pin. In India a full PIN code fills in the town, district and
 * state, never over anything the person typed.
 */
export const AddressFields: React.FC<{
  values: Values
  set: Setter
  errors: Errors
  prefix: string
  legend?: string
  withPin?: boolean
}> = ({ values, set, errors, prefix, legend, withPin }) => {
  const address: Values = values[prefix] ?? {}
  const country: string = address.country || INDIA
  const india = isIndia(country)
  const copy = addressCopy(country)
  const at = (key: string) => `${prefix}.${key}`

  const [lookup, setLookup] = useState<string | null>(null)
  const filled = useRef<Record<string, string>>({})
  const asked = useRef('')
  const lookUp = async (pin: string) => {
    if (!india || !/^[1-9]\d{5}$/.test(pin) || pin === asked.current) return
    asked.current = pin
    setLookup('Looking up your PIN code…')
    const result = await api<{
      found?: boolean
      unavailable?: boolean
      city?: string
      district?: string
      state?: string
    }>('/next/members/pincode', { body: { pin } })
    // A newer PIN code was typed meanwhile: its own lookup speaks for it
    if (asked.current !== pin) return
    if (!result.data.found) {
      setLookup(
        result.status === 429
          ? ADDRESS_ERRORS.pinTooOften
          : result.data.unavailable || !result.ok
            ? ADDRESS_ERRORS.pinUnavailable
            : ADDRESS_ERRORS.pinNotFound,
      )
      return
    }
    for (const key of ['city', 'district', 'state'] as const) {
      const next = result.data[key]
      const now = String(address[key] ?? '').trim()
      if (next && (!now || now === filled.current[key])) {
        set(at(key), next)
        filled.current[key] = next
      }
    }
    setLookup('Filled in from your PIN code. Please check them.')
  }

  const changeCountry = (next: string) => {
    if (next === country) return
    set(at('country'), next)
    for (const key of COUNTRY_BOUND) set(at(key), '')
    filled.current = {}
    asked.current = ''
    setLookup(null)
  }

  return (
    <fieldset className="grid gap-y-9">
      {legend && <legend className="display-sm mb-6">{legend}</legend>}
      <CountrySelect
        errors={errors}
        hint={copy.countryHelp}
        name={at('country')}
        onValue={changeCountry}
        value={country}
      />
      {copy.hasCode ? (
        <div>
          <TextField
            autoComplete="postal-code"
            className="max-w-xs"
            errors={errors}
            hint={copy.codeHelp}
            inputMode={copy.codeInputMode}
            label={copy.codeLabel}
            maxLength={copy.codeMaxLength}
            name={at('postalCode')}
            onValue={(v) => {
              const value = india ? v.replace(/\D/g, '') : v
              set(at('postalCode'), value)
              void lookUp(value)
            }}
            optional={copy.codeOptional}
            value={address.postalCode}
          />
          {india && lookup && (
            <p aria-live="polite" className="muted mt-2 text-base" role="status">
              {lookup}
            </p>
          )}
        </div>
      ) : (
        <p className="measure border-l-2 border-[var(--gold)] bg-surface py-4 pl-5 pr-4 text-base">
          {copy.noCodeNote}
        </p>
      )}
      <TextField
        autoComplete="address-line1"
        errors={errors}
        label={copy.line1Label}
        name={at('line1')}
        onValue={(v) => set(at('line1'), v)}
        value={address.line1}
      />
      <TextField
        autoComplete="address-line2"
        errors={errors}
        label={copy.line2Label}
        name={at('line2')}
        onValue={(v) => set(at('line2'), v)}
        optional
        value={address.line2}
      />
      <div>
        <label className="label mb-1 block" htmlFor={idFor(at('landmark'))}>
          {copy.landmarkLabel}
          <Note>{copy.landmarkNote}</Note>
        </label>
        <p className="muted mb-2 text-base" id={`${idFor(at('landmark'))}-hint`}>
          {copy.landmarkHelp}
        </p>
        <input
          aria-describedby={`${idFor(at('landmark'))}-hint`}
          className={fieldClass}
          id={idFor(at('landmark'))}
          maxLength={120}
          name={at('landmark')}
          onChange={(e) => set(at('landmark'), e.target.value)}
          value={address.landmark ?? ''}
        />
      </div>
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
        <TextField
          autoComplete="address-level2"
          errors={errors}
          label={copy.cityLabel}
          name={at('city')}
          onValue={(v) => set(at('city'), v)}
          value={address.city}
        />
        {copy.hasDistrict && (
          <TextField
            errors={errors}
            label={copy.districtLabel}
            name={at('district')}
            onValue={(v) => set(at('district'), v)}
            value={address.district}
          />
        )}
      </div>
      {copy.hasRegion && (
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          <RegionField
            country={country}
            errors={errors}
            name={at('state')}
            onValue={(v) => set(at('state'), v)}
            value={address.state}
          />
        </div>
      )}
      {withPin && (
        <LocationPin
          address={[address.line1, address.line2, address.city, address.state, address.postalCode]
            .filter((part) => typeof part === 'string' && part.trim())
            .join(', ')}
          country={country}
          help={copy.pinHelp}
          label={copy.pinLabel}
          latitude={address.latitude}
          longitude={address.longitude}
          note={copy.pinNote}
          onValue={(latitude, longitude) => {
            set(at('latitude'), latitude)
            set(at('longitude'), longitude)
          }}
          state={address.state}
          town={address.city?.trim() || address.district?.trim()}
        />
      )}
      {errors[at('latitude')] && (
        <p className="text-base italic text-destructive" role="alert">
          {errors[at('latitude')]}
        </p>
      )}
    </fieldset>
  )
}

/**
 * The postal address, asked for only when "Send post to this address" is unticked: its own
 * country, the address in one box, the town, and the postal code and region if that country
 * has them.
 */
export const PostalAddressFields: React.FC<{
  values: Values
  set: Setter
  errors: Errors
  prefix: string
}> = ({ values, set, errors, prefix }) => {
  const address: Values = values[prefix] ?? {}
  const country: string = address.country || INDIA
  const copy = addressCopy(country)
  const at = (key: string) => `${prefix}.${key}`
  return (
    <fieldset className="grid gap-y-9">
      <legend className="display-sm mb-6">{POSTAL_ADDRESS_COPY.legend}</legend>
      <CountrySelect
        errors={errors}
        name={at('country')}
        onValue={(next) => {
          if (next === country) return
          set(at('country'), next)
          set(at('postalCode'), '')
          set(at('state'), '')
        }}
        value={country}
      />
      <TextArea
        errors={errors}
        hint={POSTAL_ADDRESS_COPY.addressHelp}
        label={POSTAL_ADDRESS_COPY.addressLabel}
        limit={400}
        name={at('line1')}
        onValue={(v) => set(at('line1'), v)}
        rows={3}
        value={address.line1}
      />
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
        <TextField
          autoComplete="address-level2"
          errors={errors}
          label={copy.cityLabel}
          name={at('city')}
          onValue={(v) => set(at('city'), v)}
          value={address.city}
        />
        {copy.hasCode && (
          <TextField
            autoComplete="postal-code"
            errors={errors}
            inputMode={copy.codeInputMode}
            label={copy.codeLabel}
            maxLength={copy.codeMaxLength}
            name={at('postalCode')}
            onValue={(v) => set(at('postalCode'), v)}
            optional={copy.codeOptional}
            value={address.postalCode}
          />
        )}
      </div>
      {copy.hasRegion && (
        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          <RegionField
            country={country}
            errors={errors}
            name={at('state')}
            onValue={(v) => set(at('state'), v)}
            value={address.state}
          />
        </div>
      )}
    </fieldset>
  )
}

/** The tick box between the two addresses, with its help line */
export const SendPostHere: React.FC<{ checked: boolean; onValue: (checked: boolean) => void }> = ({
  checked,
  onValue,
}) => (
  <Check
    checked={checked}
    label={
      <>
        {POSTAL_ADDRESS_COPY.sameLabel}
        <span className="muted mt-1 block text-base">{POSTAL_ADDRESS_COPY.sameHelp}</span>
      </>
    }
    name="correspondenceSame"
    onValue={onValue}
  />
)
