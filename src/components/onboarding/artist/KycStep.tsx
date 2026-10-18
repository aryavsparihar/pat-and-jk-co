'use client'

import React, { useEffect, useRef, useState } from 'react'

import { api } from '../api'
import { ErrorSummary, type Errors, TextField } from '../fields'
import { Sending } from '../Sending'
import { StepUpProvider, useStepUp } from '../StepUp'
import { CameraCapture, type CameraProblem } from './identity/CameraCapture'
import { FilePreview } from './identity/FilePreview'
import { type Code, codeLeft, IdentityCode } from './identity/IdentityCode'
import { AGREE_PHRASE, PrivacyConsent } from './identity/PrivacyConsent'

type Masked = {
  panMasked: string | null
  aadhaarMasked: string | null
  idChoice: 'aadhaar' | 'other' | null
  otherIdKind: OtherIdKind | null
  addressOnIdMatches: boolean | null
  documents: { id: number; kind: string }[]
} | null

type DocKind =
  'pan-card' | 'masked-aadhaar' | 'other-id' | 'address-proof' | 'bank-proof' | 'identity-photo'
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
  'identity-photo': 'Photo of you holding the paper',
}

const MAX_UPLOAD = 4 * 1024 * 1024

/** Photos are made smaller in the browser so they stay under the upload limit; PDFs go as they are */
const shrink = async (file: Blob): Promise<Blob> => {
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
  /** A photograph only, not a PDF */
  photo?: boolean
  /** For a protected PDF's preview: the password the artist has typed */
  password?: string
  onUploaded: (id: number) => void
}> = ({ kind, hint, optional, value, error, photo, password, onUploaded }) => {
  const [state, setState] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The chosen file, kept in this page only, to preview
  const [file, setFile] = useState<File | null>(null)
  const { guard } = useStepUp()
  const id = `field-documents-${kind}`
  const send = async (chosen: File | undefined) => {
    if (!chosen) return
    setFile(chosen)
    setBusy(true)
    setState(null)
    const body = await shrink(chosen)
    if (body.size > MAX_UPLOAD) {
      setBusy(false)
      return setState('That file is larger than 4 MB. Please send a smaller copy or a photo.')
    }
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', body, chosen.name)
    const result = await guard(() =>
      api<{ document: { id: number } }>('/next/members/kyc/document', { body: form }),
    )
    setBusy(false)
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
      {hint && <p className="muted measure mb-2 text-base">{hint}</p>}
      <label className="btn btn-outline mt-1 min-h-11 cursor-pointer" htmlFor={id}>
        {value || file ? 'Choose another file' : 'Choose a file'}
      </label>
      <input
        accept={
          photo
            ? 'image/jpeg,image/png,image/webp'
            : 'image/jpeg,image/png,image/webp,application/pdf'
        }
        aria-describedby={error ? `${id}-error` : undefined}
        className="sr-only"
        disabled={busy}
        id={id}
        onChange={(e) => send(e.target.files?.[0])}
        type="file"
      />
      <FilePreview file={file} label={DOC_LABEL[kind]} password={password} />
      <p aria-live="polite" className="mt-2 text-base" role="status">
        {busy ? <Sending /> : (state ?? (value ? 'Received, and encrypted.' : ''))}
      </p>
      {error && (
        <p className="text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

const longDate = (iso: string | undefined) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null

/**
 * Identity details: PAN and a photo of the card, a masked e-Aadhaar or another ID, and a photo of
 * the artist holding a paper with a ten-minute code, their name and their date of birth. Consent
 * comes last, after the privacy policy has been read to the end. No bank details: those are asked
 * for only when a sale needs a payout, in the artist's account. Written to reassure: why we ask,
 * how the details are protected, and who can see them, before anything is asked for. Nothing typed
 * here is ever put in browser storage, and what comes back from the server is masked.
 */
type KycStepProps = {
  onSaved: (completedSteps: string[]) => void
  /** The privacy policy, rendered on the server, for the consent dialog */
  privacy: React.ReactNode
  /** From About you: written on the paper in the photo */
  dateOfBirth?: string
}

/** Identity details need a sign-in within the last 30 minutes; the step asks for a code if not */
export const KycStep: React.FC<KycStepProps> = (props) => (
  <StepUpProvider>
    <KycForm {...props} />
  </StepUpProvider>
)

const KycForm: React.FC<KycStepProps> = ({ onSaved, privacy, dateOfBirth }) => {
  const [masked, setMasked] = useState<Masked | undefined>(undefined)
  const [noticeVersion, setNoticeVersion] = useState<string | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState<Code | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)
  const [camera, setCamera] = useState(false)
  const [cameraProblem, setCameraProblem] = useState<CameraProblem | null>(null)
  // The photo, shown from this page's own copy, and the name it was taken for
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoFor, setPhotoFor] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoNote, setPhotoNote] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const { guard } = useStepUp()
  const [v, setV] = useState<Record<string, string | boolean | undefined>>({
    idChoice: 'aadhaar',
  })
  const [docs, setDocs] = useState<Partial<Record<DocKind, number>>>({})
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void api<{ kyc: Masked; noticeVersion?: string }>('/next/members/kyc').then((r) => {
      setMasked(r.data.kyc ?? null)
      setNoticeVersion(r.data.noticeVersion)
      setEditing(!r.data.kyc)
    })
  }, [])

  const set = (key: string) => (value: string | boolean) =>
    setV((all) => ({ ...all, [key]: value }))
  const s = (key: string) => (v[key] as string | undefined) ?? ''

  const clearPhoto = (note: string | null) => {
    setDocs(({ 'identity-photo': _photo, ...rest }) => rest)
    setPhoto(null)
    setPhotoFor(null)
    setCode(null)
    setPhotoNote(note)
  }

  // The name is written on the paper: a different name means a new photo, with a new code
  const setPanName = (value: string) => {
    set('panName')(value)
    if (photoFor !== null && value.trim() !== photoFor) {
      clearPhoto(
        'Your name has changed, so we have cleared the photo and its code. Please get a new code and take the photo again.',
      )
    }
  }

  const newCode = async () => {
    setCodeBusy(true)
    const result = await guard(() =>
      api<Omit<Code, 'gotAt'>>('/next/members/kyc/identity-code', { body: {} }),
    )
    setCodeBusy(false)
    if (!result.ok)
      return setPhotoNote(result.data.message ?? 'A code could not be given just now.')
    // The ten minutes run from now, on this device's clock: see codeLeft
    setCode({ code: result.data.code, minutes: result.data.minutes, gotAt: Date.now() })
    setPhotoNote(null)
  }

  const sendPhoto = async (blob: Blob, capturedWith: 'camera' | 'upload') => {
    setCamera(false)
    if (!code || codeLeft(code) <= 0) {
      return setPhotoNote(
        'Your code ran out before the photo was taken. Please get a new code and take it again.',
      )
    }
    const name = s('panName').trim()
    setPhoto(blob)
    setPhotoBusy(true)
    setPhotoNote(null)
    const body = await shrink(blob)
    const form = new FormData()
    form.append('kind', 'identity-photo')
    form.append('file', body, 'identity-photo.jpg')
    form.append('identityCode', code.code)
    form.append('panName', name)
    form.append('capturedWith', capturedWith)
    const result = await guard(() =>
      api<{ document: { id: number }; codeProblem?: string }>('/next/members/kyc/document', {
        body: form,
      }),
    )
    setPhotoBusy(false)
    if (!result.ok) {
      setPhoto(null)
      return setPhotoNote(result.data.message ?? 'The photo could not be sent.')
    }
    setDocs((d) => ({ ...d, 'identity-photo': result.data.document.id }))
    setPhotoFor(name)
    setPhotoNote('Received, and encrypted.')
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    setMessage(null)
    const result = await guard(() =>
      api<{ kyc: Masked; completedSteps: string[] }>('/next/members/kyc', {
        body: {
          consent: agreed,
          consentReadToEnd: agreed,
          consentTyped: agreed ? AGREE_PHRASE : '',
          noticeVersion,
          pan: s('pan'),
          panName: s('panName'),
          idChoice: v.idChoice,
          aadhaarLast4: v.idChoice === 'aadhaar' ? s('aadhaarLast4') : undefined,
          // Sent once, to open the PDF for the check; not kept here or on the server
          aadhaarPassword: v.idChoice === 'aadhaar' ? s('aadhaarPassword') || undefined : undefined,
          otherIdKind: v.idChoice === 'other' ? v.otherIdKind : undefined,
          addressOnIdMatches:
            typeof v.addressOnIdMatches === 'boolean' ? v.addressOnIdMatches : undefined,
          documents: docs,
        },
      }),
    )
    setBusy(false)
    if (!result.ok) {
      setErrors(result.data.errors ?? {})
      if (!result.data.errors) setMessage(result.data.message ?? 'Your details could not be saved.')
      return
    }
    // Forget what was typed: from here on only the masked view is shown
    setV({ idChoice: 'aadhaar' })
    clearPhoto(null)
    setAgreed(false)
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
          <strong className="font-medium">Why we ask.</strong> To be sure of who you are, and to
          keep the records the law asks of us when we pay you. We ask for bank details only when one
          of your works sells, in your account, never by email.
        </p>
        <p>
          <strong className="font-medium">How it is kept.</strong> Your details are encrypted the
          moment they reach us, and documents are encrypted before they are stored. We show them
          back to you only in part, like the last four digits of your Aadhaar.
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
          <dt className="label pt-1">Documents</dt>
          <dd>
            {masked.documents.length
              ? masked.documents.map((d) => DOC_LABEL[d.kind as DocKind]).join(', ')
              : 'None'}
          </dd>
        </dl>
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

      <fieldset className="grid gap-y-8">
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
          onValue={setPanName}
          value={s('panName')}
        />
        <Upload
          error={errors['documents.pan-card']}
          hint="A clear photo of the front of your PAN card, or your e-PAN. Your face in the card's photograph must be easy to see, and so must your name and number. We compare the face with the photo of you below."
          kind="pan-card"
          onUploaded={(id) => setDocs((d) => ({ ...d, 'pan-card': id }))}
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
                password={s('aadhaarPassword')}
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

      <fieldset className="mt-14 grid gap-y-6" id="field-documents-identity-photo">
        <legend className="display-sm mb-4">A photo of you</legend>
        <p className="measure">
          So we know a real person is applying, and that it is you. We give you a code that lasts
          ten minutes. On a sheet of paper, write the code, your full name as it is on your PAN, and
          your date of birth. Then take a photo of yourself holding the paper beside your face.
        </p>
        <ul className="measure grid list-disc gap-2 pl-6 text-base">
          <li>Write clearly, in capitals, large enough to read in the photo.</li>
          <li>
            Your date of birth
            {longDate(dateOfBirth) ? `, as you gave it: ${longDate(dateOfBirth)}` : ''}.
          </li>
          <li>Good light on your face. No sunglasses, cap or mask.</li>
          <li>Only the code is timed. Take as long as you need over the rest of this step.</li>
        </ul>

        {!s('panName').trim() ? (
          <p className="muted measure text-base">
            First, give your name as it is on your PAN, above. It is what you will write on the
            paper.
          </p>
        ) : (
          <>
            <IdentityCode busy={codeBusy} code={code} onNew={() => void newCode()}>
              {!camera && (
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  {cameraProblem === null && (
                    <button
                      className="btn btn-solid min-h-11"
                      disabled={photoBusy}
                      onClick={() => setCamera(true)}
                      type="button"
                    >
                      Take a photo now
                    </button>
                  )}
                  <label
                    className={`min-h-11 cursor-pointer ${cameraProblem === null ? 'link link-caps inline-flex items-center' : 'btn btn-solid'}`}
                    htmlFor="identity-photo-file"
                  >
                    {cameraProblem === null ? 'Upload a photo instead' : 'Upload the photo'}
                  </label>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={photoBusy}
                    id="identity-photo-file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void sendPhoto(file, 'upload')
                    }}
                    type="file"
                  />
                </div>
              )}
            </IdentityCode>
            {cameraProblem && (
              <p className="measure text-base" role="status">
                {cameraProblem === 'declined'
                  ? 'The camera was not allowed, which is fine. Take the photo with your camera app and upload it here instead.'
                  : 'We could not open a camera on this device. Take the photo another way and upload it here instead.'}
              </p>
            )}
            {camera && (
              <CameraCapture
                onCapture={(blob) => void sendPhoto(blob, 'camera')}
                onClose={() => setCamera(false)}
                onProblem={(problem) => {
                  setCamera(false)
                  setCameraProblem(problem)
                }}
              />
            )}
          </>
        )}

        <FilePreview file={photo} label="the photo of you" />
        <p aria-live="polite" className="text-base" role="status">
          {photoBusy ? <Sending /> : photoNote}
        </p>
        {errors['documents.identity-photo'] && (
          <p
            className="text-base italic text-destructive"
            id="field-documents-identity-photo-error"
          >
            {errors['documents.identity-photo']}
          </p>
        )}
      </fieldset>

      <div className="mt-14">
        <PrivacyConsent
          agreed={agreed}
          error={errors.consent ?? errors.consentReadToEnd ?? errors.consentTyped}
          onAgreed={setAgreed}
          privacy={privacy}
        />
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-border pt-8">
        <button className="btn btn-solid min-h-11" disabled={busy || !agreed} type="submit">
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
