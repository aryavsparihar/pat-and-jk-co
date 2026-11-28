'use client'

import React, { useState } from 'react'

import { api } from '@/components/onboarding/api'
import { HowWeUseYourDetails } from '@/components/onboarding/artist/steps'
import { IdentityPhoto, NAME_CHANGED } from '@/components/onboarding/artist/identity/IdentityPhoto'
import { Upload } from '@/components/onboarding/artist/identity/Upload'
import {
  ErrorSummary,
  type Errors,
  fieldClass,
  idFor,
  SelectField,
  TextField,
} from '@/components/onboarding/fields'
import { Sending } from '@/components/onboarding/Sending'
import { StepUpProvider, useStepUp } from '@/components/onboarding/StepUp'
import { COUNTRIES } from '@/forms/country/data'
import {
  type PrimaryId,
  VERIFY_CHECKBOX,
  VERIFY_NOTICE_VERSION,
  type VerifyKind,
  verifyAskFor,
  verifyNotice,
} from '@/kyc/verify'

type DocKey =
  | 'pan-card'
  | 'passport-page'
  | 'masked-aadhaar'
  | 'other-id'
  | 'address-proof'
  | 'identity-photo'

/** What the page starts from: the application, and whatever was saved to finish later */
export type VerifyStart = {
  kind: VerifyKind
  reference: string
  primary: PrimaryId
  /** The name in the application, or the one saved on the PAN or passport */
  panName: string
  passportName: string
  dateOfBirth: string | null
  saved: {
    panMasked: string | null
    passportMasked: string | null
    aadhaarLast4: boolean
    passportCountry: string | null
    passportExpiry: string | null
    idChoice: 'aadhaar' | 'other' | null
    otherIdKind: string | null
    addressOnIdMatches: boolean | null
    documents: { id: number; kind: string }[]
  }
}

const DOC_KEYS: DocKey[] = [
  'pan-card',
  'passport-page',
  'masked-aadhaar',
  'other-id',
  'address-proof',
  'identity-photo',
]

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: c }))

/** A section: its small heading in the left column, the fields on the right (the house frame) */
const Part: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <section className="house-sec border-t border-[#e3cfa3]">
    <div className="house-lab">
      <p className="house-small">{label}</p>
    </div>
    <div className="house-con max-w-[780px]">{children}</div>
  </section>
)

const Radio: React.FC<{
  name: string
  checked: boolean
  onChange: () => void
  label: string
  hint?: string
}> = ({ name, checked, onChange, label, hint }) => (
  <label className="flex min-h-11 cursor-pointer items-start gap-3 text-lg">
    <input
      checked={checked}
      className="mt-1.5 size-[18px] flex-none accent-[var(--primary)]"
      name={name}
      onChange={onChange}
      type="radio"
    />
    <span>
      {label}
      {hint && <span className="muted block text-base">{hint}</span>}
    </span>
  </label>
)

const FieldError: React.FC<{ name: string; errors: Errors }> = ({ name, errors }) =>
  errors[name] ? (
    <p className="mt-2 text-base italic text-destructive" id={`${idFor(name)}-error`}>
      {errors[name]}
    </p>
  ) : null

/**
 * "Confirm who you are" (the founder's Verify design), after approval. The page follows the
 * country in the application, and either way can be switched: in India a PAN and, for artists, a
 * masked e-Aadhaar or another ID; anywhere else a passport and a national identity card,
 * residence permit or driving licence. Then a photo of them holding a paper with a ten-minute
 * code. Trade partners see the PAN or passport and the photo only. It can be saved and finished
 * later; once sent, the team checks it and the agreement unlocks.
 *
 * Numbers saved earlier never come back to the page: it says they are on file, and the server
 * keeps them unless they are typed again.
 */
export const VerifyIdentity: React.FC<{ start: VerifyStart }> = (props) => (
  <StepUpProvider>
    <VerifyForm {...props} />
  </StepUpProvider>
)

const VerifyForm: React.FC<{ start: VerifyStart }> = ({ start }) => {
  const { kind, saved } = start
  const artist = kind === 'artist'
  const { guard } = useStepUp()
  const [primary, setPrimary] = useState<PrimaryId>(start.primary)
  const [v, setV] = useState<Record<string, string>>({
    panName: start.panName,
    passportName: start.passportName,
    passportCountry: saved.passportCountry ?? '',
    passportExpiry: saved.passportExpiry ?? '',
  })
  const [idChoice, setIdChoice] = useState<'aadhaar' | 'other' | null>(saved.idChoice)
  const [abroadId, setAbroadId] = useState<string | null>(saved.otherIdKind)
  const [matches, setMatches] = useState<boolean | null>(saved.addressOnIdMatches)
  const [docs, setDocs] = useState<Partial<Record<DocKey, number>>>(() =>
    Object.fromEntries(
      saved.documents
        .filter((d) => DOC_KEYS.includes(d.kind as DocKey))
        .map((d) => [d.kind, d.id]),
    ),
  )
  const [consent, setConsent] = useState(false)
  const [typed, setTyped] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'send' | 'save' | null>(null)
  const [done, setDone] = useState<'sent' | 'saved' | null>(null)
  // The photo: remounted (a new key) to clear it when the name on the paper changes
  const [photo, setPhoto] = useState<{ key: number; for: string | null; note: string | null }>({
    key: 0,
    for: null,
    note: null,
  })

  const set = (key: string) => (value: string) => setV((all) => ({ ...all, [key]: value }))
  const doc = (key: DocKey) => (id: number) => setDocs((all) => ({ ...all, [key]: id }))
  const pan = primary === 'pan'
  const docName = pan ? 'PAN' : 'passport'
  const nameKey = pan ? 'panName' : 'passportName'
  const nameOnId = v[nameKey] ?? ''

  const clearPhoto = (note: string | null) => {
    setDocs(({ 'identity-photo': _photo, ...rest }) => rest)
    setPhoto((p) => ({ key: p.key + 1, for: null, note }))
  }
  // The name is written on the paper: a different name means a new photo, with a new code
  const setName = (value: string) => {
    set(nameKey)(value)
    if (photo.for !== null && value.trim() !== photo.for) clearPhoto(NAME_CHANGED)
  }
  const switchTo = (next: PrimaryId) => {
    setPrimary(next)
    setErrors({})
    if (photo.for !== null) clearPhoto(NAME_CHANGED)
  }

  const submit = async (send: boolean) => {
    setBusy(send ? 'send' : 'save')
    setErrors({})
    setMessage(null)
    const result = await guard(() =>
      api<{ sent: boolean }>('/next/members/kyc', {
        body: {
          for: kind,
          send,
          primary,
          pan: v.pan,
          panName: v.panName,
          passportNumber: v.passportNumber,
          passportCountry: v.passportCountry,
          passportExpiry: v.passportExpiry,
          passportName: v.passportName,
          idChoice: artist && pan ? idChoice : undefined,
          aadhaarLast4: artist && pan && idChoice === 'aadhaar' ? v.aadhaarLast4 : undefined,
          // Sent once, to open the PDF for the check; never kept here or on the server
          aadhaarPassword:
            artist && pan && idChoice === 'aadhaar' ? v.aadhaarPassword || undefined : undefined,
          abroadId: artist && !pan ? abroadId : undefined,
          addressOnIdMatches: artist && typeof matches === 'boolean' ? matches : undefined,
          addressNote: artist && matches === false ? v.addressNote : undefined,
          documents: docs,
          consent,
          consentTyped: typed,
          noticeVersion: VERIFY_NOTICE_VERSION,
        },
      }),
    )
    setBusy(null)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      if (!result.data.errors)
        setMessage(result.data.message ?? 'Your details could not be saved. Please try again.')
      return
    }
    setDone(send ? 'sent' : 'saved')
    window.scrollTo({ top: 0 })
  }

  if (done === 'sent') {
    return (
      <Part label="Sent">
        <h2 className="apply-h1">Thank you</h2>
        <p className="house-lead">
          We are checking your details. We will email you once we have, and your agreement will
          then be ready to read and sign in your account.
        </p>
        <p className="mt-6">
          <a className="link link-caps" href="/account">
            Go to your account
          </a>
        </p>
      </Part>
    )
  }

  const agreeId = idFor('consentTyped')

  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void submit(true))}>
      {(message || Object.keys(errors).length > 0 || done === 'saved') && (
        <section className="house-sec border-t border-[#e3cfa3]">
          <div className="house-lab" />
          <div className="house-con max-w-[780px]">
            {done === 'saved' && (
              <p className="mb-6" role="status">
                Saved. You can finish later from your account.
              </p>
            )}
            <ErrorSummary errors={errors} />
            {message && (
              <p className="text-base italic text-destructive" role="alert">
                {message}
              </p>
            )}
          </div>
        </section>
      )}

      <Part label="Before you begin">
        <HowWeUseYourDetails
          checkbox={VERIFY_CHECKBOX}
          checked={consent}
          error={errors.consent}
          intro={null}
          name="consent"
          onValue={setConsent}
          rows={verifyNotice(verifyAskFor(kind, primary))}
        >
          <div className="mt-6 max-w-xs">
            <label className="label mb-1 block" htmlFor={agreeId}>
              To confirm, type I AGREE
            </label>
            <p className="muted mb-2 text-base" id={`${agreeId}-hint`}>
              In capital letters.
            </p>
            <input
              aria-describedby={[`${agreeId}-hint`, errors.consentTyped && `${agreeId}-error`]
                .filter(Boolean)
                .join(' ')}
              aria-invalid={errors.consentTyped ? true : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              className={`${fieldClass} tracking-wider`}
              id={agreeId}
              onChange={(e) => setTyped(e.target.value)}
              spellCheck={false}
              type="text"
              value={typed}
            />
            <FieldError errors={errors} name="consentTyped" />
          </div>
        </HowWeUseYourDetails>
      </Part>

      <Part label={pan ? 'Your PAN' : 'Your passport'}>
        {pan ? (
          <div className="grid gap-y-8">
            <TextField
              autoCapitalize="characters"
              autoComplete="off"
              errors={errors}
              hint={
                saved.panMasked
                  ? `Saved as ${saved.panMasked}. Type it again only to change it.`
                  : 'Ten characters, for example ABCDE1234F.'
              }
              label="PAN"
              maxLength={10}
              name="pan"
              onValue={set('pan')}
              spellCheck={false}
              value={v.pan}
            />
            <TextField
              autoComplete="name"
              errors={errors}
              hint="Filled in from your application. Change it if your card shows it differently."
              label="Name as printed on your PAN"
              maxLength={120}
              name="panName"
              onValue={setName}
              value={v.panName}
            />
            <Upload
              error={errors['documents.pan-card']}
              hint="The front of the card, or your e-PAN. Your face, name and number must be easy to read: we compare the face with the photo of you below."
              kind="pan-card"
              onUploaded={doc('pan-card')}
              type={kind}
              value={docs['pan-card']}
            />
            <p className="text-base">
              Live outside India?{' '}
              <button className="link" onClick={() => switchTo('passport')} type="button">
                Use your passport instead.
              </button>
            </p>
          </div>
        ) : (
          <div className="grid gap-y-8">
            <TextField
              autoCapitalize="characters"
              autoComplete="off"
              errors={errors}
              hint={
                saved.passportMasked
                  ? `Saved as ${saved.passportMasked}. Type it again only to change it.`
                  : undefined
              }
              label="Passport number"
              maxLength={20}
              name="passportNumber"
              onValue={set('passportNumber')}
              spellCheck={false}
              value={v.passportNumber}
            />
            <SelectField
              className="max-w-sm"
              errors={errors}
              hint="The country on the passport."
              label="Issued by"
              name="passportCountry"
              onValue={set('passportCountry')}
              options={COUNTRY_OPTIONS}
              placeholder="Choose…"
              value={v.passportCountry}
            />
            <TextField
              className="max-w-xs"
              errors={errors}
              hint="Day, month and year."
              label="Valid until"
              name="passportExpiry"
              onValue={set('passportExpiry')}
              type="date"
              value={v.passportExpiry}
            />
            <TextField
              autoComplete="name"
              errors={errors}
              hint="Filled in from your application. Change it if your passport shows it differently."
              label="Name as printed on your passport"
              maxLength={120}
              name="passportName"
              onValue={setName}
              value={v.passportName}
            />
            <Upload
              error={errors['documents.passport-page']}
              hint="The whole page, with the two lines of code at the bottom. Your face, name and number must be easy to read: we compare the face with the photo of you below."
              kind="passport-page"
              onUploaded={doc('passport-page')}
              type={kind}
              value={docs['passport-page']}
            />
            <p className="text-base">
              Live in India?{' '}
              <button className="link" onClick={() => switchTo('pan')} type="button">
                Use your PAN instead.
              </button>
            </p>
          </div>
        )}
      </Part>

      {artist && (
        <Part label="Second ID">
          <h3 className="font-display text-[1.625rem] font-normal text-[var(--primary)]">
            A second ID, with your address
          </h3>
          <p className="mt-2">Choose one.</p>
          {pan ? (
            <fieldset className="mt-4" id={idFor('idChoice')}>
              <legend className="sr-only">Second ID</legend>
              <Radio
                checked={idChoice === 'aadhaar'}
                hint="The quickest. We can check it automatically."
                label="Masked e-Aadhaar"
                name="idChoice"
                onChange={() => setIdChoice('aadhaar')}
              />
              <Radio
                checked={idChoice === 'other'}
                hint="Our team checks it by hand."
                label="Passport, voter ID or driving licence"
                name="idChoice"
                onChange={() => setIdChoice('other')}
              />
              <FieldError errors={errors} name="idChoice" />
            </fieldset>
          ) : (
            <fieldset className="mt-4" id={idFor('abroadId')}>
              <legend className="sr-only">Second ID</legend>
              <Radio
                checked={abroadId === 'national-id'}
                hint="One that shows your current address."
                label="National identity card or residence permit"
                name="abroadId"
                onChange={() => setAbroadId('national-id')}
              />
              <Radio
                checked={abroadId === 'driving-licence'}
                hint="One that shows your current address."
                label="Driving licence"
                name="abroadId"
                onChange={() => setAbroadId('driving-licence')}
              />
              <FieldError errors={errors} name="abroadId" />
            </fieldset>
          )}

          {pan && idChoice === 'aadhaar' && (
            <div className="mt-8 grid gap-y-8">
              <p className="measure">
                A masked e-Aadhaar shows only the last four digits of your Aadhaar number. We never
                ask for, or keep, the whole number.
              </p>
              <div className="apply-notice">
                <p className="font-medium">How to download a masked e-Aadhaar</p>
                <ol className="mt-2 grid list-decimal gap-y-1 pl-6">
                  <li>
                    Go to myaadhaar.uidai.gov.in and sign in with your Aadhaar number and the code
                    sent to your phone.
                  </li>
                  <li>
                    Choose Download Aadhaar, and tick “Do you want a masked Aadhaar?”.
                  </li>
                  <li>
                    Upload the PDF here as it was downloaded, without opening and saving it again.
                  </li>
                </ol>
                <p className="mt-3 text-base">
                  Only have a photo or a scan? Upload that instead, and our team will check it by
                  hand.
                </p>
              </div>
              <Upload
                error={errors['documents.masked-aadhaar']}
                kind="masked-aadhaar"
                onUploaded={doc('masked-aadhaar')}
                password={v.aadhaarPassword}
                type={kind}
                value={docs['masked-aadhaar']}
              />
              <TextField
                autoComplete="off"
                className="max-w-[10rem]"
                errors={errors}
                hint={
                  saved.aadhaarLast4
                    ? 'Saved. Type them again only to change them.'
                    : 'As shown on the masked copy.'
                }
                inputMode="numeric"
                label="Last four digits"
                maxLength={4}
                name="aadhaarLast4"
                onValue={set('aadhaarLast4')}
                value={v.aadhaarLast4}
              />
              <TextField
                autoComplete="off"
                className="max-w-xs"
                errors={errors}
                hint="If it asks for one: the first four letters of your name in capitals, then your year of birth, for example ANAY1994. We use it once to open the file, and never keep it."
                label="The PDF’s password"
                name="aadhaarPassword"
                onValue={set('aadhaarPassword')}
                optional
                type="password"
                value={v.aadhaarPassword}
              />
            </div>
          )}

          {((pan && idChoice === 'other') || (!pan && abroadId)) && (
            <div className="mt-8 grid gap-y-8">
              <p className="measure">
                Our team checks it by hand. Cover any number on it that you would rather we didn’t
                see, except your name and address.
              </p>
              <Upload
                error={errors['documents.other-id']}
                kind="other-id"
                onUploaded={doc('other-id')}
                type={kind}
                value={docs['other-id']}
              />
            </div>
          )}

          {(idChoice || abroadId) && (
            <fieldset className="mt-10" id={idFor('addressOnIdMatches')}>
              <legend className="label mb-2">Does it show the address in your application?</legend>
              <Radio
                checked={matches === true}
                label="Yes"
                name="addressOnIdMatches"
                onChange={() => setMatches(true)}
              />
              <Radio
                checked={matches === false}
                hint="If not, tell us why in a line, for example that you have moved."
                label="No"
                name="addressOnIdMatches"
                onChange={() => setMatches(false)}
              />
              <FieldError errors={errors} name="addressOnIdMatches" />
              {matches === false && (
                <div className="mt-6 grid gap-y-8">
                  <TextField
                    errors={errors}
                    label="Why it is different"
                    maxLength={300}
                    name="addressNote"
                    onValue={set('addressNote')}
                    value={v.addressNote}
                  />
                  <Upload
                    error={errors['documents.address-proof']}
                    hint="A recent utility bill, bank statement or rent agreement with your current address."
                    kind="address-proof"
                    onUploaded={doc('address-proof')}
                    type={kind}
                    value={docs['address-proof']}
                  />
                </div>
              )}
            </fieldset>
          )}
        </Part>
      )}

      <Part label="A photo of you">
        <p className="measure">
          So that we know it is really you. When you are ready, we will show you a short code.
          Write the code, your name as it is on your {docName}
          {artist ? ', and your date of birth' : ''} on a sheet of paper. Then take a photo of
          yourself holding the paper beside your face.
        </p>
        <ul className="measure mt-4 grid list-disc gap-y-1 pl-6">
          <li>Write clearly, in capitals, large enough to read in the photo.</li>
          <li>Good light on your face. No sunglasses, cap or mask.</li>
          <li>The code lasts ten minutes. If it runs out, ask for a new one.</li>
        </ul>
        <div className="mt-6" id={idFor('documents.identity-photo')}>
          {docs['identity-photo'] && photo.for === null && photo.key === 0 ? (
            <div className="grid gap-y-3">
              <p role="status">Your photo was received, and encrypted.</p>
              <div>
                <button
                  className="link link-caps min-h-11"
                  onClick={() => clearPhoto(null)}
                  type="button"
                >
                  Take it again
                </button>
              </div>
            </div>
          ) : (
            <IdentityPhoto
              docName={docName}
              error={errors['documents.identity-photo']}
              key={photo.key}
              name={nameOnId}
              note={photo.note}
              onSent={(id, name) => {
                doc('identity-photo')(id)
                setPhoto((p) => ({ ...p, for: name, note: null }))
              }}
              type={kind}
            />
          )}
          <FieldError errors={errors} name="documents.identity-photo" />
        </div>
      </Part>

      <Part label="Send">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <button className="btn btn-solid min-h-11" disabled={busy !== null} type="submit">
            {busy === 'send' ? <Sending label="Sending" /> : 'Send for checking'}
          </button>
          <button
            className="link link-caps min-h-11"
            disabled={busy !== null}
            onClick={() => void submit(false)}
            type="button"
          >
            {busy === 'save' ? <Sending label="Saving" /> : 'Save and finish later'}
          </button>
        </div>
        <p className="muted measure mt-6">
          Once we have checked your details, we send the agreement to your account to read and
          sign.
        </p>
      </Part>
    </form>
  )
}
