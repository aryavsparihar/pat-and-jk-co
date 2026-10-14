'use client'

import React, { useRef, useState } from 'react'

import { STATES_AND_TERRITORIES } from '@/members/forms/india'
import {
  BIO_LIMIT,
  DETAILS_LIMIT,
  LANGUAGES,
  MEDIUMS,
  MIN_LENGTH,
  OTHER_SOCIALS_MAX,
  PRICE_RANGES,
  RECOGNITION_KINDS,
  YEARS_PRACTISING_MAX,
  yearChoices,
} from '@/members/forms/schemas'

import { api } from '../api'
import { Check, CheckGroup, type Errors, SelectField, TextArea, TextField } from '../fields'
import { Roller, type RollerOption } from '../Roller'
import { LocationPin } from './LocationPin'

/* eslint-disable @typescript-eslint/no-explicit-any -- step values are free-form until the schema checks them */
export type Values = Record<string, any>
export type StepProps = {
  values: Values
  set: (path: string, value: unknown) => void
  errors: Errors
}

/** The latest date of birth that makes someone 18 today */
const eighteenYearsAgo = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().slice(0, 10)
}

export const AboutStep: React.FC<StepProps> = ({ values, set, errors }) => (
  <div className="grid gap-y-9">
    <TextField
      autoComplete="name"
      errors={errors}
      hint="As it appears on your PAN card. We use it only to confirm who you are."
      label="Your full legal name"
      name="legalName"
      onValue={(v) => set('legalName', v)}
      value={values.legalName}
    />
    <TextField
      errors={errors}
      hint="The name your work is known by. It can be your own name."
      label="The name you work under"
      name="displayName"
      onValue={(v) => set('displayName', v)}
      value={values.displayName}
    />
    <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
      <TextField
        autoComplete="bday"
        errors={errors}
        hint="You need to be 18 or over to apply."
        label="Date of birth"
        max={eighteenYearsAgo()}
        name="dateOfBirth"
        onValue={(v) => set('dateOfBirth', v)}
        type="date"
        value={values.dateOfBirth}
      />
      <TextField
        autoComplete="tel"
        errors={errors}
        hint="For an Indian number, the ten digits are enough. Otherwise, start with your country code."
        inputMode="tel"
        label="Mobile number"
        name="phone"
        onValue={(v) => set('phone', v)}
        type="tel"
        value={values.phone}
      />
    </div>
    <SelectField
      className="max-w-sm"
      errors={errors}
      label="The language you would like us to write in"
      name="language"
      onValue={(v) => set('language', v)}
      options={LANGUAGES}
      value={values.language}
    />
  </div>
)

const AddressFields: React.FC<
  StepProps & { prefix: string; legend: string; withPin?: boolean }
> = ({ values, set, errors, prefix, legend, withPin }) => {
  const address = values[prefix] ?? {}
  const india = /^(india|bharat)$/i.test(address.country ?? 'India')
  const at = (key: string) => `${prefix}.${key}`

  // A full PIN code fills in the town, district and state. Only fields that are empty, or still
  // hold what the last lookup put there, are filled: nothing the person typed is overwritten, and
  // everything stays editable
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
        result.data.unavailable || !result.ok
          ? 'We could not look up your PIN code just now. Please type the town and district.'
          : 'We could not find that PIN code. Please check it.',
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

  return (
    <fieldset className="grid gap-y-9">
      <legend className="display-sm mb-6">{legend}</legend>
      <TextField
        autoComplete="address-line1"
        errors={errors}
        label="Address line 1"
        name={at('line1')}
        onValue={(v) => set(at('line1'), v)}
        value={address.line1}
      />
      <TextField
        autoComplete="address-line2"
        errors={errors}
        label="Address line 2"
        name={at('line2')}
        onValue={(v) => set(at('line2'), v)}
        optional
        value={address.line2}
      />
      <TextField
        errors={errors}
        hint="Something nearby that helps a courier find you."
        label="Landmark"
        name={at('landmark')}
        onValue={(v) => set(at('landmark'), v)}
        optional
        value={address.landmark}
      />
      <div>
        <TextField
          autoComplete="postal-code"
          className="max-w-xs"
          errors={errors}
          hint={
            india
              ? 'We fill in the town, district and state from it. You can change them.'
              : undefined
          }
          inputMode={india ? 'numeric' : 'text'}
          label={india ? 'PIN code' : 'Postal code'}
          maxLength={india ? 6 : 12}
          name={at('postalCode')}
          onValue={(v) => {
            const value = india ? v.replace(/\D/g, '') : v
            set(at('postalCode'), value)
            void lookUp(value)
          }}
          value={address.postalCode}
        />
        {india && lookup && (
          <p aria-live="polite" className="muted mt-2 text-base" role="status">
            {lookup}
          </p>
        )}
      </div>
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
        <TextField
          autoComplete="address-level2"
          errors={errors}
          label="City or town"
          name={at('city')}
          onValue={(v) => set(at('city'), v)}
          value={address.city}
        />
        <TextField
          errors={errors}
          label="District"
          name={at('district')}
          onValue={(v) => set(at('district'), v)}
          value={address.district}
        />
      </div>
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
        {india ? (
          <SelectField
            errors={errors}
            label="State or union territory"
            name={at('state')}
            onValue={(v) => set(at('state'), v)}
            options={STATES_AND_TERRITORIES}
            value={address.state}
          />
        ) : (
          <TextField
            autoComplete="address-level1"
            errors={errors}
            label="State, province or region"
            name={at('state')}
            onValue={(v) => set(at('state'), v)}
            value={address.state}
          />
        )}
      </div>
      <TextField
        autoComplete="country-name"
        className="max-w-sm"
        errors={errors}
        label="Country"
        name={at('country')}
        onValue={(v) => set(at('country'), v)}
        value={address.country ?? 'India'}
      />
      {withPin && (
        <LocationPin
          latitude={address.latitude}
          longitude={address.longitude}
          address={[
            address.line1,
            address.line2,
            address.city,
            address.district,
            address.state,
            address.postalCode,
          ]
            .filter((part) => typeof part === 'string' && part.trim())
            .join(', ')}
          onValue={(latitude, longitude) => {
            set(at('latitude'), latitude)
            set(at('longitude'), longitude)
          }}
          state={address.state}
        />
      )}
    </fieldset>
  )
}

export const AddressStep: React.FC<StepProps> = (props) => {
  const { values, set } = props
  return (
    <div className="grid gap-y-12">
      <AddressFields {...props} legend="Your home address" prefix="residence" withPin />
      <Check
        checked={values.correspondenceSame !== false}
        label="Send post to this address"
        name="correspondenceSame"
        onValue={(checked) => set('correspondenceSame', checked)}
      />
      {values.correspondenceSame === false && (
        <AddressFields {...props} legend="Where to send post" prefix="correspondence" />
      )}
    </div>
  )
}

const YEARS_PRACTISING: RollerOption[] = [
  { value: 0, label: 'Less than one' },
  ...Array.from({ length: YEARS_PRACTISING_MAX }, (_, i) => ({
    value: i + 1,
    label: i === 0 ? '1 year' : `${i + 1} years`,
  })),
]

const YEARS: RollerOption[] = yearChoices().map((y) => ({ value: y, label: String(y) }))

export const PracticeStep: React.FC<StepProps> = ({ values, set, errors }) => {
  const mediums: string[] = values.mediums ?? []
  const recognition: Values[] = values.recognition ?? []
  const otherSocials: Values[] = values.otherSocials ?? []
  const none = values.recognitionNone === true
  return (
    <div className="grid gap-y-11">
      <CheckGroup
        error={errors.mediums}
        hint="Choose all that apply."
        legend="What do you work in?"
        name="mediums"
        onValue={(v) => set('mediums', v)}
        options={MEDIUMS}
        value={mediums}
      />
      {mediums.includes('other') && (
        <TextField
          className="max-w-md"
          errors={errors}
          label="Your other medium"
          name="mediumOther"
          onValue={(v) => set('mediumOther', v)}
          value={values.mediumOther}
        />
      )}
      <TextArea
        errors={errors}
        hint={`What your work looks like, and what it keeps returning to. At least ${MIN_LENGTH.general} characters: a sentence or two.`}
        label="Styles and themes"
        limit={500}
        min={MIN_LENGTH.general}
        name="stylesThemes"
        onValue={(v) => set('stylesThemes', v)}
        rows={3}
        value={values.stylesThemes}
      />
      <Roller
        error={errors.yearsPractising}
        hint="Count from when you began making work seriously."
        label="How long you have been practising"
        name="yearsPractising"
        onValue={(v) => set('yearsPractising', v)}
        options={YEARS_PRACTISING}
        value={values.yearsPractising}
      />
      <TextArea
        errors={errors}
        hint="Art school, an apprenticeship, workshops, a family tradition, or teaching yourself."
        label="Training and education"
        limit={1000}
        name="training"
        onValue={(v) => set('training', v)}
        optional
        rows={3}
        value={values.training}
      />
      <TextArea
        errors={errors}
        hint={`Written in the third person, as it might appear beside your work. At least ${MIN_LENGTH.bio} characters: four or five sentences.`}
        label="A short biography"
        limit={BIO_LIMIT}
        min={MIN_LENGTH.bio}
        name="bio"
        onValue={(v) => set('bio', v)}
        rows={6}
        value={values.bio}
      />
      <TextArea
        errors={errors}
        hint="What you are trying to do, in your own words."
        label="Artist statement"
        limit={2000}
        name="statement"
        onValue={(v) => set('statement', v)}
        optional
        rows={5}
        value={values.statement}
      />

      <fieldset className="grid gap-y-8">
        <legend className="label mb-1">Where we can see your work online</legend>
        <p className="muted text-base">All optional.</p>
        <TextField
          autoComplete="url"
          className="max-w-xl"
          errors={errors}
          label="Website"
          name="website"
          onValue={(v) => set('website', v)}
          optional
          placeholder="https://"
          type="url"
          value={values.website}
        />
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          <TextField
            errors={errors}
            hint="Your handle, or a link."
            label="Instagram"
            name="instagram"
            onValue={(v) => set('instagram', v)}
            optional
            placeholder="@yourname"
            value={values.instagram}
          />
          <TextField
            errors={errors}
            hint="Your page's link, or your username."
            label="Facebook"
            name="facebook"
            onValue={(v) => set('facebook', v)}
            optional
            value={values.facebook}
          />
        </div>
        {otherSocials.length > 0 && (
          <ol className="grid gap-y-6">
            {otherSocials.map((item, i) => (
              <li
                className="grid items-end gap-x-8 gap-y-5 border-t border-border pt-6 sm:grid-cols-[minmax(0,14rem)_1fr_auto]"
                key={i}
              >
                <TextField
                  errors={errors}
                  label="Platform"
                  name={`otherSocials.${i}.platform`}
                  onValue={(v) => set(`otherSocials.${i}.platform`, v)}
                  placeholder="e.g. Behance"
                  value={item.platform}
                />
                <TextField
                  errors={errors}
                  label="Link or ID"
                  name={`otherSocials.${i}.handle`}
                  onValue={(v) => set(`otherSocials.${i}.handle`, v)}
                  value={item.handle}
                />
                <button
                  className="link link-caps min-h-11 justify-self-start"
                  onClick={() =>
                    set(
                      'otherSocials',
                      otherSocials.filter((_, j) => j !== i),
                    )
                  }
                  type="button"
                >
                  Remove<span className="sr-only"> {item.platform || 'this platform'}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {otherSocials.length < OTHER_SOCIALS_MAX && (
          <button
            className="link link-caps min-h-11 justify-self-start"
            onClick={() => set('otherSocials', [...otherSocials, {}])}
            type="button"
          >
            Add another platform
          </button>
        )}
      </fieldset>

      <SelectField
        className="max-w-sm"
        errors={errors}
        hint="For a typical original work. It helps us place you, and commits you to nothing."
        label="Typical price range"
        name="priceRange"
        onValue={(v) => set('priceRange', v)}
        options={PRICE_RANGES}
        value={values.priceRange}
      />

      <fieldset
        aria-describedby={errors.recognition ? 'field-recognition-error' : undefined}
        id="field-recognition"
        tabIndex={-1}
      >
        <legend className="label mb-1">Exhibitions and awards</legend>
        <p className="muted measure mb-4 text-base">
          The ones that matter most to you. If there are none yet, say so: everyone begins
          somewhere.
        </p>
        <Check
          checked={none}
          label="None yet"
          name="recognitionNone"
          onValue={(checked) => set('recognitionNone', checked)}
        />
        {!none && (
          <>
            <ol className="mt-4 grid gap-y-10">
              {recognition.map((item, i) => (
                <li className="grid gap-x-10 gap-y-7 border-t border-border pt-7" key={i}>
                  <div className="grid gap-x-10 gap-y-7 sm:grid-cols-[12rem_1fr]">
                    <SelectField
                      errors={errors}
                      label="Kind"
                      name={`recognition.${i}.kind`}
                      onValue={(v) => set(`recognition.${i}.kind`, v)}
                      options={RECOGNITION_KINDS}
                      value={item.kind}
                    />
                    <TextField
                      errors={errors}
                      label="Name"
                      name={`recognition.${i}.title`}
                      onValue={(v) => set(`recognition.${i}.title`, v)}
                      value={item.title}
                    />
                  </div>
                  <div className="grid gap-x-10 gap-y-7 sm:grid-cols-[1fr_13rem]">
                    <TextField
                      errors={errors}
                      hint="The gallery, festival, institution or publisher, and the town."
                      label="Where"
                      name={`recognition.${i}.venue`}
                      onValue={(v) => set(`recognition.${i}.venue`, v)}
                      value={item.venue}
                    />
                    <Roller
                      error={errors[`recognition.${i}.year`]}
                      label="Year"
                      name={`recognition.${i}.year`}
                      onValue={(v) => set(`recognition.${i}.year`, v)}
                      options={YEARS}
                      value={item.year}
                    />
                  </div>
                  <TextArea
                    errors={errors}
                    hint={`What it was, and what you showed or won. At least ${MIN_LENGTH.general} characters.`}
                    label="Details"
                    limit={DETAILS_LIMIT}
                    min={MIN_LENGTH.general}
                    name={`recognition.${i}.details`}
                    onValue={(v) => set(`recognition.${i}.details`, v)}
                    rows={3}
                    value={item.details}
                  />
                  <button
                    className="link link-caps min-h-11 justify-self-start"
                    onClick={() =>
                      set(
                        'recognition',
                        recognition.filter((_, j) => j !== i),
                      )
                    }
                    type="button"
                  >
                    Remove<span className="sr-only"> {item.title || 'this entry'}</span>
                  </button>
                </li>
              ))}
            </ol>
            {recognition.length < 20 && (
              <button
                className="link link-caps mt-6 min-h-11"
                onClick={() => set('recognition', [...recognition, { kind: 'exhibition' }])}
                type="button"
              >
                {recognition.length === 0
                  ? 'Add an exhibition or award'
                  : 'Add another exhibition or award'}
              </button>
            )}
          </>
        )}
        {errors.recognition && (
          <p className="mt-2 text-base italic text-destructive" id="field-recognition-error">
            {errors.recognition}
          </p>
        )}
      </fieldset>
    </div>
  )
}
