'use client'

import React from 'react'

import {
  BIO_LIMIT,
  DETAILS_LIMIT,
  EXPERIENCE_BANDS,
  MEDIUMS,
  OFFERED_PRICE_RANGES,
  TAKEN_MEDIUMS,
  MIN_LENGTH,
  OTHER_SOCIALS_MAX,
  RECOGNITION_KINDS,
  yearChoices,
} from '@/members/forms/schemas'
import {
  ARTIST_NOTICE,
  ARTIST_NOTICE_CHECKBOX,
  ARTIST_NOTICE_HEADING,
  ARTIST_NOTICE_INTRO,
} from '@/members/applicationNotice'
import { cn } from '@/utilities/ui'

import { AddressFields, PhoneField, PostalAddressFields, SendPostHere } from '../country'
import {
  Check,
  CheckGroup,
  type Errors,
  fieldClass,
  idFor,
  SelectField,
  TextArea,
  TextField,
} from '../fields'
import { Roller, type RollerOption } from '../Roller'

/* eslint-disable @typescript-eslint/no-explicit-any -- step values are free-form until the schema checks them */
export type Values = Record<string, any>
export type StepProps = {
  values: Values
  set: (path: string, value: unknown) => void
  errors: Errors
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * The date of birth as the design asks for it: the day, the month from a list, and the year. It
 * is kept as one date (YYYY-MM-DD) once all three are given, and checked on the server.
 */
const DateOfBirth: React.FC<{
  value?: string
  onValue: (value: string) => void
  error?: string
}> = ({ value, onValue, error }) => {
  const [y = '', m = '', d = ''] = (value ?? '').split('-')
  const [parts, setParts] = React.useState({
    day: d ? String(Number(d)) : '',
    month: m ? String(Number(m)) : '',
    year: y,
  })
  const update = (next: Partial<typeof parts>) => {
    const all = { ...parts, ...next }
    setParts(all)
    const day = all.day.replace(/\D/g, '')
    const year = all.year.replace(/\D/g, '')
    onValue(
      day && all.month && year.length === 4
        ? `${year}-${all.month.padStart(2, '0')}-${day.padStart(2, '0')}`
        : '',
    )
  }
  const id = idFor('dateOfBirth')
  return (
    <fieldset
      aria-describedby={[`${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ')}
      className="min-w-0"
      id={id}
    >
      <legend className="label mb-1">Date of birth</legend>
      <p className="muted mb-2 text-base" id={`${id}-hint`}>
        You need to be 18 or over to apply.
      </p>
      <div className="flex flex-wrap gap-5">
        <div className="w-[90px]">
          <label className="muted block" htmlFor={`${id}-day`}>
            Day
          </label>
          <input
            aria-invalid={error ? true : undefined}
            autoComplete="bday-day"
            className={fieldClass}
            id={`${id}-day`}
            inputMode="numeric"
            maxLength={2}
            onChange={(e) => update({ day: e.target.value })}
            type="text"
            value={parts.day}
          />
        </div>
        <div className="w-[200px] max-w-full">
          <label className="muted block" htmlFor={`${id}-month`}>
            Month
          </label>
          <select
            aria-invalid={error ? true : undefined}
            autoComplete="bday-month"
            className={cn(fieldClass, 'cursor-pointer')}
            id={`${id}-month`}
            onChange={(e) => update({ month: e.target.value })}
            value={parts.month}
          >
            <option value="">Choose…</option>
            {MONTHS.map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[120px]">
          <label className="muted block" htmlFor={`${id}-year`}>
            Year
          </label>
          <input
            aria-invalid={error ? true : undefined}
            autoComplete="bday-year"
            className={fieldClass}
            id={`${id}-year`}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => update({ year: e.target.value })}
            type="text"
            value={parts.year}
          />
        </div>
      </div>
      {error && (
        <p className="mt-2 text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** "How we use your details", and the tick box that agrees to it (the Apply1 design) */
export const HowWeUseYourDetails: React.FC<{
  checked: boolean
  onValue: (checked: boolean) => void
  error?: string
  /** The trade form's own rows (TRADE_NOTICE); the artist's by default */
  rows?: { term: string; text: string }[]
  /** The line under the heading; the trade form has none */
  intro?: string | null
  name?: string
  /** The tick box's words; the application's by default */
  checkbox?: string
  children?: React.ReactNode
}> = ({
  checked,
  onValue,
  error,
  rows = ARTIST_NOTICE,
  intro = ARTIST_NOTICE_INTRO,
  name = 'consentProcessing',
  checkbox = ARTIST_NOTICE_CHECKBOX,
  children,
}) => (
  <div className="apply-notice">
    <h3 className="font-display text-[1.625rem] font-normal text-[var(--primary)]">
      {ARTIST_NOTICE_HEADING}
    </h3>
    {intro && <p className="muted mb-1.5 mt-1">{intro}</p>}
    <dl>
      {rows.map(({ term, text }) => (
        <React.Fragment key={term}>
          <dt>{term}</dt>
          <dd>
            {term === 'Your rights' ? (
              <>
                {text.split('compliance@pjk.co.in')[0]}
                <a className="link" href="mailto:compliance@pjk.co.in">
                  compliance@pjk.co.in
                </a>
                {text.split('compliance@pjk.co.in')[1]}
              </>
            ) : (
              text
            )}
          </dd>
        </React.Fragment>
      ))}
    </dl>
    <p className="mb-5 mt-[18px] text-base">
      <a className="link" href="/privacy" rel="noopener" target="_blank">
        Read the full privacy notice
      </a>
    </p>
    <Check
      checked={checked}
      error={error}
      label={checkbox}
      name={name}
      onValue={onValue}
    />
    {children}
  </div>
)

export const AboutStep: React.FC<StepProps> = ({ values, set, errors }) => (
  <div className="grid gap-y-9">
    <TextField
      autoComplete="name"
      errors={errors}
      hint="We use it when we write to you. It is never shown publicly."
      label="Your full name"
      name="legalName"
      onValue={(v) => set('legalName', v)}
      value={values.legalName}
    />
    <TextField
      errors={errors}
      hint="The name your work is known by. It can be your own."
      label="The name you work under"
      name="displayName"
      onValue={(v) => set('displayName', v)}
      value={values.displayName}
    />
    <DateOfBirth
      error={errors.dateOfBirth}
      onValue={(v) => set('dateOfBirth', v)}
      value={values.dateOfBirth}
    />
    <PhoneField
      className="max-w-[480px]"
      errors={errors}
      label="Mobile number"
      name="phone"
      onValue={(v) => set('phone', v)}
      value={values.phone}
    />
    <HowWeUseYourDetails
      checked={values.consentProcessing === true}
      error={errors.consentProcessing}
      onValue={(v) => set('consentProcessing', v)}
    />
  </div>
)

/** Where you live, as in the Apply2 design: the home address, then the postal address if it differs */
export const AddressStep: React.FC<StepProps> = ({ values, set, errors }) => (
  <div className="grid gap-y-12">
    <AddressFields errors={errors} prefix="residence" set={set} values={values} withPin />
    <SendPostHere
      checked={values.correspondenceSame !== false}
      onValue={(checked) => set('correspondenceSame', checked)}
    />
    {values.correspondenceSame === false && (
      <PostalAddressFields errors={errors} prefix="correspondence" set={set} values={values} />
    )}
  </div>
)

const EXPERIENCE_OPTIONS = EXPERIENCE_BANDS.map((b) => ({ value: String(b.value), label: b.label }))

const YEARS: RollerOption[] = yearChoices().map((y) => ({ value: y, label: String(y) }))

export const PracticeStep: React.FC<StepProps> = ({ values, set, errors }) => {
  const mediums: string[] = values.mediums ?? []
  const recognition: Values[] = values.recognition ?? []
  const otherSocials: Values[] = values.otherSocials ?? []
  const none = values.recognitionNone === true
  // A medium no longer taken stays on the list, ticked, only while a draft still has it, so the
  // artist can see the line about it and untick it
  const offered = [
    ...TAKEN_MEDIUMS,
    ...MEDIUMS.filter((m) => 'retired' in m && mediums.includes(m.value)),
  ]
  return (
    <div className="grid gap-y-11">
      <div>
        <CheckGroup
          error={errors.mediums}
          hint="Choose all that apply."
          legend="What do you work in?"
          name="mediums"
          onValue={(v) => set('mediums', v)}
          options={offered}
          value={mediums}
        />
        <p className="muted mt-2 text-base">
          Choosing “Other” asks you to name it. Phulhaar takes original, hand-made work only, each
          piece one of a kind: no prints, photographs or digital work.
        </p>
      </div>
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
        hint="What your work looks like, and what it keeps returning to. A sentence or two is enough."
        label="Your style and subjects"
        limit={500}
        min={MIN_LENGTH.general}
        name="stylesThemes"
        onValue={(v) => set('stylesThemes', v)}
        rows={3}
        value={values.stylesThemes}
      />
      <SelectField
        className="max-w-[340px]"
        errors={errors}
        hint="Count from when you began to work seriously."
        label="How long have you been making work?"
        name="yearsPractising"
        onValue={(v) => set('yearsPractising', v === '' ? '' : Number(v))}
        options={EXPERIENCE_OPTIONS}
        placeholder="Choose…"
        value={
          values.yearsPractising === undefined || values.yearsPractising === ''
            ? ''
            : String(values.yearsPractising)
        }
      />
      <TextArea
        errors={errors}
        hint="Art school, an apprenticeship, workshops, a family tradition, or self-taught."
        label="Training"
        limit={1000}
        name="training"
        onValue={(v) => set('training', v)}
        optional
        rows={3}
        value={values.training}
      />
      <TextArea
        errors={errors}
        hint="Written in the third person, as it might appear beside your work. Four or five sentences, at least 250 characters. For example: “Anaya paints the river towns of the Jammu plains in small, close-worked pictures…”"
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
        <legend className="label mb-1">
          Where we can see your work online{' '}
          <span className="normal-case tracking-normal text-muted-foreground">(optional)</span>
        </legend>
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
            label="Instagram: your handle or a link"
            name="instagram"
            onValue={(v) => set('instagram', v)}
            optional
            placeholder="@yourname"
            value={values.instagram}
          />
          <TextField
            errors={errors}
            label="Facebook: your page’s link or username"
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
            Add another link
          </button>
        )}
      </fieldset>

      <SelectField
        className="max-w-sm"
        errors={errors}
        hint="For a typical original work, in Indian rupees, as every price on Phulhaar is set wherever you live (one lakh is ₹1,00,000). It helps us place you, and commits you to nothing."
        label="Your usual price range"
        name="priceRange"
        onValue={(v) => set('priceRange', v)}
        options={OFFERED_PRICE_RANGES}
        placeholder="Choose…"
        value={values.priceRange}
      />

      <fieldset
        aria-describedby={errors.recognition ? 'field-recognition-error' : undefined}
        id="field-recognition"
        tabIndex={-1}
      >
        <legend className="label mb-1">Exhibitions and awards</legend>
        <p className="muted measure mb-4 text-base">
          The ones that matter most to you. If there are none yet, tick the box: everyone begins
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
