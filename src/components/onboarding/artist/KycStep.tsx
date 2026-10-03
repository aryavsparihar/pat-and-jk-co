'use client'

import React, { useEffect, useRef, useState } from 'react'

import { namesPlausiblyMatch } from '@/kyc/values'

import { api } from '../api'
import { Check, ErrorSummary, type Errors, fieldClass, TextField } from '../fields'

type Masked = {
  panMasked: string | null
  aadhaarMasked: string | null
  idChoice: 'aadhaar' | 'other' | null
  otherIdKind: OtherIdKind | null
  addressOnIdMatches: boolean | null
  bank: { accountMasked: string; ifscMasked: string; bankName: string; accountType: string }
  nameMismatch: boolean
  documents: { id: number; kind: string }[]
} | null

type DocKind = 'pan-card' | 'masked-aadhaar' | 'other-id' | 'address-proof' | 'bank-proof'
type OtherIdKind = 'passport' | 'voter-id' | 'driving-licence'

const OTHER_ID_LABEL: Record<OtherIdKind, string> = {
  passport: 'Passport',
  'voter-id': 'Voter ID',
  'driving-licence': 'Driving licence',
}

const DOC_LABEL: Record<DocKind, string> = {
  'pan-card': 'PAN card',
  'masked-aadhaar': 'Masked e-Aadhaar',
  'other-id': 'Your ID',
  'address-proof': 'Proof of address',
  'bank-proof': 'Cancelled cheque or passbook',
}

const MAX_UPLOAD = 4 * 1024 * 1024

/** Photos are made smaller in the browser so they stay under the upload limit; PDFs go as they are */
const shrink = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith('image/') || file.size <= 3 * 1024 * 1024) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.88),
  )
}

const Lock: React.FC = () => (
  <svg
    aria-hidden
    className="mt-1 size-6 shrink-0 text-primary"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    viewBox="0 0 24 24"
  >
    <rect height="10" rx="1.5" width="15" x="4.5" y="10.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.2" />
  </svg>
)

/** One upload, sent straight to the server, encrypted there before it is kept */
const Upload: React.FC<{
  kind: DocKind
  hint?: string
  optional?: boolean
  value?: number
  error?: string
  onUploaded: (id: number) => void
}> = ({ kind, hint, optional, value, error, onUploaded }) => {
  const [state, setState] = useState<string | null>(null)
  const id = `field-documents-${kind}`
  const send = async (file: File | undefined) => {
    if (!file) return
    setState('Sending…')
    const body = await shrink(file)
    if (body.size > MAX_UPLOAD)
      return setState('That file is larger than 4 MB. Please send a smaller copy or a photo.')
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', body, file.name)
    const result = await api<{ document: { id: number } }>('/next/members/kyc/document', {
      body: form,
    })
    if (!result.ok) return setState(result.data.message ?? 'That file could not be sent.')
    onUploaded(result.data.document.id)
    setState('Received, and encrypted.')
  }
  return (
    <div>
      <p className="label mb-1">
        {DOC_LABEL[kind]}
        {optional && (
          <span className="ml-2 normal-case tracking-normal text-muted-foreground">(optional)</span>
        )}
      </p>
      {hint && <p className="muted mb-2 text-base">{hint}</p>}
      <label className="btn btn-outline mt-1 min-h-11 cursor-pointer" htmlFor={id}>
        {value ? 'Replace the file' : 'Choose a file'}
      </label>
      <input
        accept="image/jpeg,image/png,image/webp,application/pdf"
        aria-describedby={error ? `${id}-error` : undefined}
        className="sr-only"
        id={id}
        onChange={(e) => send(e.target.files?.[0])}
        type="file"
      />
      <p aria-live="polite" className="mt-2 text-base" role="status">
        {state ?? (value ? 'Received, and encrypted.' : '')}
      </p>
      {error && (
        <p className="text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * Identity and bank details. Written to reassure: why we ask, how the details are protected, and
 * who can see them, before anything is asked for. Nothing typed here is ever put in browser
 * storage, and what comes back from the server is masked.
 */
export const KycStep: React.FC<{
  legalName?: string
  onSaved: (completedSteps: string[]) => void
}> = ({ legalName, onSaved }) => {
  const [masked, setMasked] = useState<Masked | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState<Record<string, string | boolean | undefined>>({
    accountType: 'savings',
    idChoice: 'aadhaar',
  })
  const [docs, setDocs] = useState<Partial<Record<DocKind, number>>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lookup, setLookup] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void api<{ kyc: Masked }>('/next/members/kyc').then((r) => {
      setMasked(r.data.kyc ?? null)
      setEditing(!r.data.kyc)
    })
  }, [])

  const set = (key: string) => (value: string | boolean) =>
    setV((all) => ({ ...all, [key]: value }))
  const s = (key: string) => (v[key] as string | undefined) ?? ''

  const findBranch = async () => {
    const ifsc = s('ifsc').toUpperCase()
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return
    setLookup('Looking up the branch…')
    const result = await api<{
      found: boolean
      bank?: string
      branch?: string
      unavailable?: boolean
    }>('/next/members/kyc/ifsc', { body: { ifsc } })
    if (result.data.found) {
      setV((all) => ({
        ...all,
        bankName: result.data.bank ?? all.bankName,
        branchName: result.data.branch ?? all.branchName,
      }))
      setLookup('Bank and branch filled in. Please check them.')
    } else {
      setLookup(
        result.data.unavailable
          ? 'We could not look that up just now; please type the bank and branch.'
          : 'We could not find that IFSC. Please check it.',
      )
    }
  }

  const holder = s('holderName')
  const names = [legalName, s('panName')].filter(Boolean) as string[]
  const mismatch =
    holder.length > 2 && names.length > 0 && !names.some((n) => namesPlausiblyMatch(n, holder))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    const result = await api<{ kyc: Masked; completedSteps: string[] }>('/next/members/kyc', {
      body: {
        consent: v.consent === true,
        pan: s('pan'),
        panName: s('panName'),
        idChoice: v.idChoice,
        aadhaarLast4: v.idChoice === 'aadhaar' ? s('aadhaarLast4') : undefined,
        // Sent once, to open the PDF for the check; not kept here or on the server
        aadhaarPassword: v.idChoice === 'aadhaar' ? s('aadhaarPassword') || undefined : undefined,
        otherIdKind: v.idChoice === 'other' ? v.otherIdKind : undefined,
        addressOnIdMatches:
          typeof v.addressOnIdMatches === 'boolean' ? v.addressOnIdMatches : undefined,
        bank: {
          holderName: holder,
          accountNumber: s('accountNumber'),
          accountNumberConfirm: s('accountNumberConfirm'),
          ifsc: s('ifsc'),
          bankName: s('bankName'),
          branchName: s('branchName'),
          accountType: v.accountType,
        },
        documents: docs,
      },
    })
    setBusy(false)
    if (!result.ok) {
      const flat: Errors = {}
      for (const [key, value] of Object.entries(result.data.errors ?? {}))
        flat[key.replace(/^bank\./, '')] = value
      setErrors(flat)
      if (!result.data.errors) setMessage(result.data.message ?? 'Your details could not be saved.')
      return
    }
    // Forget what was typed: from here on only the masked view is shown
    setV({ accountType: 'savings', idChoice: 'aadhaar' })
    setMasked(result.data.kyc)
    setEditing(false)
    onSaved(result.data.completedSteps)
  }

  if (masked === undefined)
    return (
      <p className="muted" role="status">
        One moment…
      </p>
    )

  const reassurance = (
    <div className="mb-10 flex gap-4 bg-surface p-6">
      <Lock />
      <div className="measure grid gap-y-3">
        <p>
          <strong className="font-medium">Why we ask.</strong> To be sure we are paying the right
          person, and to keep the records the law asks of us when we pay you.
        </p>
        <p>
          <strong className="font-medium">How it is kept.</strong> Your details are encrypted the
          moment they reach us, and documents are encrypted before they are stored. We show them
          back to you only in part, like the last four digits of your account.
        </p>
        <p>
          <strong className="font-medium">Who sees them.</strong> Only the few people at PJK who
          check them, and every time they look it is recorded. We never sell or share them.
        </p>
      </div>
    </div>
  )

  if (!editing && masked) {
    return (
      <div>
        {reassurance}
        <dl className="grid gap-y-3 sm:grid-cols-[12rem_1fr]">
          <dt className="label pt-1">PAN</dt>
          <dd className="tracking-wider">{masked.panMasked ?? 'Not given yet'}</dd>
          {masked.aadhaarMasked && (
            <>
              <dt className="label pt-1">Aadhaar</dt>
              <dd className="tracking-wider">{masked.aadhaarMasked}</dd>
            </>
          )}
          {masked.idChoice === 'other' && masked.otherIdKind && (
            <>
              <dt className="label pt-1">ID</dt>
              <dd>{OTHER_ID_LABEL[masked.otherIdKind]}, to be checked by our team</dd>
            </>
          )}
          <dt className="label pt-1">Account</dt>
          <dd className="tracking-wider">
            {masked.bank.accountMasked}, {masked.bank.bankName}
          </dd>
          <dt className="label pt-1">Documents</dt>
          <dd>
            {masked.documents.length
              ? masked.documents.map((d) => DOC_LABEL[d.kind as DocKind]).join(', ')
              : 'None'}
          </dd>
        </dl>
        {masked.nameMismatch && (
          <p className="measure mt-6 text-base italic">
            The name on the bank account looks different from yours. That is fine if it is a joint
            account or a shortened name; we will ask you if we need to.
          </p>
        )}
        <button
          className="link link-caps mt-8 min-h-11"
          onClick={() => setEditing(true)}
          type="button"
        >
          Change these details
        </button>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={save}>
      {reassurance}
      <ErrorSummary errors={errors} />
      {message && (
        <p className="mb-8 text-base italic text-destructive" role="alert">
          {message}
        </p>
      )}

      <Check
        checked={v.consent === true}
        error={errors.consent}
        label="I agree to PAT and J.K. Co. processing my identity and bank details to verify who I am and to pay me, as the privacy notice describes."
        name="consent"
        onValue={(c) => set('consent')(c)}
      />

      <fieldset className="mt-12 grid gap-y-8">
        <legend className="display-sm mb-4">Your identity</legend>
        <TextField
          autoCapitalize="characters"
          autoComplete="off"
          errors={errors}
          hint="Ten characters, e.g. ABCPE1234F. We need it to pay you, and for tax."
          label="PAN"
          maxLength={10}
          name="pan"
          onValue={(x) => set('pan')(x.toUpperCase())}
          spellCheck={false}
          value={s('pan')}
        />
        <TextField
          autoComplete="off"
          errors={errors}
          hint="Exactly as it is printed on the card."
          label="Name as on your PAN"
          name="panName"
          onValue={set('panName')}
          value={s('panName')}
        />
        <Upload
          kind="pan-card"
          onUploaded={(id) => setDocs((d) => ({ ...d, 'pan-card': id }))}
          optional
          value={docs['pan-card']}
        />

        <fieldset className="grid gap-y-6 border-t border-border pt-8">
          <legend className="label">A second document, with your address</legend>
          <div className="grid gap-y-2" role="radiogroup">
            <label className="flex min-h-11 cursor-pointer items-start gap-4 py-1">
              <input
                checked={v.idChoice === 'aadhaar'}
                className="mt-1 size-5 accent-[var(--primary)]"
                name="idChoice"
                onChange={() => set('idChoice')('aadhaar')}
                type="radio"
              />
              <span>
                Masked e-Aadhaar
                <span className="muted block text-base">
                  The quickest: we can check it automatically.
                </span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-4 py-1">
              <input
                checked={v.idChoice === 'other'}
                className="mt-1 size-5 accent-[var(--primary)]"
                name="idChoice"
                onChange={() => set('idChoice')('other')}
                type="radio"
              />
              <span>
                I’d rather use another ID
                <span className="muted block text-base">
                  A passport, voter ID or driving licence. Our team checks it by hand.
                </span>
              </span>
            </label>
          </div>

          {v.idChoice === 'aadhaar' ? (
            <>
              <p className="measure muted text-base">
                The masked e-Aadhaar shows only the last four digits of your number. We never ask
                for, or keep, the whole number.
              </p>
              <div className="measure text-base">
                <p className="font-medium">How to download a masked e-Aadhaar</p>
                <ol className="muted mt-2 list-decimal pl-5">
                  <li>
                    Go to myaadhaar.uidai.gov.in and sign in with your Aadhaar number and the code
                    sent to your phone.
                  </li>
                  <li>Choose Download Aadhaar, and tick “Do you want a masked Aadhaar?”.</li>
                  <li>Upload the PDF here just as it downloaded, without opening and saving it.</li>
                </ol>
                <p className="muted mt-2">
                  Only have a photo or a scan? Upload that instead; our team will check it by hand.
                </p>
              </div>
              <Upload
                error={errors['documents.masked-aadhaar']}
                kind="masked-aadhaar"
                onUploaded={(id) => setDocs((d) => ({ ...d, 'masked-aadhaar': id }))}
                value={docs['masked-aadhaar']}
              />
              <TextField
                autoComplete="off"
                className="max-w-xs"
                errors={errors}
                hint="The four digits shown on the masked copy."
                inputMode="numeric"
                label="Last four digits of your Aadhaar"
                maxLength={4}
                name="aadhaarLast4"
                onValue={(x) => set('aadhaarLast4')(x.replace(/\D/g, ''))}
                value={s('aadhaarLast4')}
              />
              <TextField
                autoComplete="off"
                className="max-w-xs"
                errors={errors}
                hint="The PDF’s password: the first four letters of your name in capitals, then your year of birth. We use it once, to check the file, and never keep it."
                label="The PDF’s password"
                name="aadhaarPassword"
                onValue={set('aadhaarPassword')}
                optional
                spellCheck={false}
                type="password"
                value={s('aadhaarPassword')}
              />
            </>
          ) : (
            <>
              <div className="grid gap-y-2" role="radiogroup" aria-label="Which ID">
                <label className="flex min-h-11 cursor-pointer items-start gap-4 py-1">
                  <input
                    checked={v.otherIdKind === 'passport'}
                    className="mt-1 size-5 accent-[var(--primary)]"
                    name="otherIdKind"
                    onChange={() => set('otherIdKind')('passport')}
                    type="radio"
                  />
                  <span>Passport</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-4 py-1">
                  <input
                    checked={v.otherIdKind === 'voter-id'}
                    className="mt-1 size-5 accent-[var(--primary)]"
                    name="otherIdKind"
                    onChange={() => set('otherIdKind')('voter-id')}
                    type="radio"
                  />
                  <span>Voter ID</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-4 py-1">
                  <input
                    checked={v.otherIdKind === 'driving-licence'}
                    className="mt-1 size-5 accent-[var(--primary)]"
                    name="otherIdKind"
                    onChange={() => set('otherIdKind')('driving-licence')}
                    type="radio"
                  />
                  <span>Driving licence</span>
                </label>
              </div>
              {errors.otherIdKind && (
                <p className="text-base italic text-destructive" id="field-otherIdKind-error">
                  {errors.otherIdKind}
                </p>
              )}
              <Upload
                error={errors['documents.other-id']}
                hint="A clear photo or scan of the page with your photo, name, date of birth and address."
                kind="other-id"
                onUploaded={(id) => setDocs((d) => ({ ...d, 'other-id': id }))}
                value={docs['other-id']}
              />
            </>
          )}

          <fieldset
            aria-describedby={
              errors.addressOnIdMatches ? 'field-addressOnIdMatches-error' : undefined
            }
            id="field-addressOnIdMatches"
          >
            <legend className="label mb-2">Does it show the address you gave us?</legend>
            {([true, false] as const).map((yes) => (
              <label
                className="mr-8 inline-flex min-h-11 cursor-pointer items-center gap-3"
                key={String(yes)}
              >
                <input
                  checked={v.addressOnIdMatches === yes}
                  className="size-5 accent-[var(--primary)]"
                  name="addressOnIdMatches"
                  onChange={() => set('addressOnIdMatches')(yes)}
                  type="radio"
                />
                {yes ? 'Yes' : 'No'}
              </label>
            ))}
            {errors.addressOnIdMatches && (
              <p
                className="mt-2 text-base italic text-destructive"
                id="field-addressOnIdMatches-error"
              >
                {errors.addressOnIdMatches}
              </p>
            )}
          </fieldset>
          {v.addressOnIdMatches === false && (
            <Upload
              error={errors['documents.address-proof']}
              hint="A recent utility bill, bank statement or rent agreement in your name."
              kind="address-proof"
              onUploaded={(id) => setDocs((d) => ({ ...d, 'address-proof': id }))}
              value={docs['address-proof']}
            />
          )}
        </fieldset>
      </fieldset>

      <fieldset className="mt-14 grid gap-y-8">
        <legend className="display-sm mb-4">Where we pay you</legend>
        <TextField
          autoComplete="off"
          errors={errors}
          hint="As the bank has it."
          label="Account holder’s name"
          name="holderName"
          onValue={set('holderName')}
          value={holder}
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
            value={s('accountNumber')}
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
              value={s('accountNumberConfirm')}
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
          value={s('ifsc')}
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
            value={s('bankName')}
          />
          <TextField
            autoComplete="off"
            errors={errors}
            label="Branch"
            name="branchName"
            onValue={set('branchName')}
            value={s('branchName')}
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
        <Upload
          hint="It helps us check the account quickly."
          kind="bank-proof"
          onUploaded={(id) => setDocs((d) => ({ ...d, 'bank-proof': id }))}
          optional
          value={docs['bank-proof']}
        />
      </fieldset>

      <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border pt-8">
        <button className="btn btn-solid min-h-11" disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
        {masked && (
          <button
            className="link link-caps min-h-11"
            onClick={() => setEditing(false)}
            type="button"
          >
            Keep the details I gave before
          </button>
        )}
      </div>
    </form>
  )
}
