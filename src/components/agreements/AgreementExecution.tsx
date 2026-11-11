'use client'

import React, { useEffect, useState } from 'react'

import type { AgreementDocument } from '@/agreements/documents'
import { api } from '@/components/onboarding/api'
import { IdentityPhoto } from '@/components/onboarding/artist/identity/IdentityPhoto'
import { Sending } from '@/components/onboarding/Sending'
import { StepUpProvider, useStepUp } from '@/components/onboarding/StepUp'

type Wording = Omit<AgreementDocument, 'text'>

type Status = {
  state: 'not-started' | 'in-progress' | 'pending-countersignature' | 'executed'
  signer: {
    name: string
    memberCode: string
    taxIdMasked: string
    email: string
    phone: string
    address: string
    firm: string
    firmRegistration: string
  }
  photo: { at: string; code: string } | null
  signedAtIst: string | null
  version: string
  ip: string
}

const AGREE = 'I AGREE'
const ID_KEY = 'pjk-agreement-id'

/** The time in India, to the second: what the audit readout shows as it ticks */
const istNow = () =>
  `${new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })} IST`

const remember = (id: string) => {
  try {
    sessionStorage.setItem(ID_KEY, id)
  } catch {
    // Private windows may refuse; the ID is simply asked for again
  }
}

/**
 * Signing beneath the agreement: the member's ID first (a second check beside the emailed code),
 * then who they are as the agreement will name them, the live photo with its ten-minute code, the
 * founder's notice, the two declarations, I AGREE, and the button, which stays disabled until all
 * of them are done. The audit readout beneath it shows what will be recorded.
 */
export const AgreementExecution: React.FC<{ agreement: Wording }> = (props) => (
  <StepUpProvider>
    <Execution {...props} />
  </StepUpProvider>
)

const Execution: React.FC<{ agreement: Wording }> = ({ agreement }) => {
  const [id, setId] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = async (memberId: string) => {
    setBusy(true)
    setMessage(null)
    const result = await api<Status>(
      `/next/members/agreement?kind=${agreement.kind}&id=${encodeURIComponent(memberId)}`,
    )
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'That did not work.')
    remember(memberId)
    setStatus(result.data)
  }

  useEffect(() => {
    let saved = ''
    try {
      saved = sessionStorage.getItem(ID_KEY) ?? ''
    } catch {
      saved = ''
    }
    if (saved.startsWith(`${agreement.prefix}-`)) {
      queueMicrotask(() => {
        setId(saved)
        void load(saved)
      })
    }
    // Once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!status) {
    return (
      <form
        className="mt-14 grid max-w-md gap-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void load(id.trim().toUpperCase())
        }}
      >
        <h2 className="display-sm">Sign this agreement</h2>
        <label className="label" htmlFor="agreement-id">
          Your {agreement.signer} ID ({agreement.prefix}-xxxxx)
        </label>
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full border-0 border-b border-input bg-transparent px-0 py-2 text-[1.15rem] tracking-wider focus:border-primary focus:outline-none"
          id="agreement-id"
          onChange={(e) => setId(e.target.value)}
          placeholder={`${agreement.prefix}-`}
          spellCheck={false}
          value={id}
        />
        <p className="muted text-base">It is in the email telling you that you were approved.</p>
        <div>
          <button className="btn btn-solid min-h-11" disabled={busy || !id.trim()} type="submit">
            Continue
          </button>
        </div>
        <p aria-live="polite" className="text-base" role="status">
          {busy ? <Sending /> : message}
        </p>
      </form>
    )
  }

  if (status.state === 'pending-countersignature' || status.state === 'executed') {
    return (
      <div className="mt-14 grid gap-y-4">
        <h2 className="display-sm">Signed</h2>
        <p className="measure">
          You signed this agreement on {status.signedAtIst}.{' '}
          {status.state === 'executed'
            ? 'PAT & J.K. Co. has countersigned it, and the executed copy has been emailed to you.'
            : 'PAT & J.K. Co. will now countersign it with its digital signature certificate, and email you the executed copy.'}
        </p>
        <p className="muted text-base">{status.version}</p>
      </div>
    )
  }

  return <SignForm agreement={agreement} id={id.trim().toUpperCase()} status={status} />
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid gap-x-6 gap-y-1 border-t border-border py-3 sm:grid-cols-[16rem_1fr]">
    <dt className="label">{label}</dt>
    <dd className="min-w-0 break-words">{children || '—'}</dd>
  </div>
)

const inputClass =
  'w-full border-0 border-b border-input bg-transparent px-0 py-2 focus:border-primary focus:outline-none'

const SignForm: React.FC<{ agreement: Wording; id: string; status: Status }> = ({
  agreement,
  id,
  status,
}) => {
  const { signer } = status
  const partner = agreement.kind === 'partner'
  const [photo, setPhoto] = useState<{ code: string } | null>(status.photo)
  const [code, setCode] = useState<string | null>(status.photo?.code ?? null)
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [typed, setTyped] = useState('')
  const [firm, setFirm] = useState(signer.firm)
  const [firmRegistration, setFirmRegistration] = useState(signer.firmRegistration)
  const [address, setAddress] = useState(signer.address)
  const [now, setNow] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [signedAt, setSignedAt] = useState<string | null>(null)
  const { guard } = useStepUp()

  useEffect(() => {
    const tick = () => setNow(istNow())
    queueMicrotask(tick)
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  const partnerReady = !partner || (firm.trim() && firmRegistration.trim() && address.trim())
  const ready = Boolean(photo && terms && privacy && typed === AGREE && partnerReady)

  const sign = async () => {
    setBusy(true)
    setMessage(null)
    const result = await guard(() =>
      api<{ signedAtIst: string }>('/next/members/agreement', {
        body: {
          kind: agreement.kind,
          id,
          action: 'sign',
          typed,
          agreedTerms: terms,
          agreedPrivacy: privacy,
          ...(partner ? { firm, firmRegistration, address } : {}),
        },
      }),
    )
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'That did not work. Please try again.')
    setSignedAt(result.data.signedAtIst)
  }

  if (signedAt) {
    return (
      <div className="mt-14 grid gap-y-4" role="status">
        <h2 className="display-sm">Signed</h2>
        <p className="measure">
          Thank you. You signed this agreement on {signedAt}. PAT & J.K. Co. will now countersign it
          with its digital signature certificate, and email the executed copy to {signer.email}.
        </p>
        <p className="muted text-base">{agreement.version}</p>
      </div>
    )
  }

  return (
    <div className="mt-14 grid gap-y-14">
      <section aria-labelledby="signer-heading">
        <h2 className="display-sm" id="signer-heading">
          {partner ? 'The Trade Partner' : 'The Artist'}
        </h2>
        <dl className="mt-6 border-b border-border">
          {partner ? (
            <>
              <Row label="Signatory Full Legal Name">{signer.name}</Row>
              <Row label="Firm / Studio Legal Name">
                <input
                  aria-label="Firm / Studio Legal Name"
                  className={inputClass}
                  maxLength={200}
                  onChange={(e) => setFirm(e.target.value)}
                  value={firm}
                />
              </Row>
              <Row label="PT ID">{signer.memberCode}</Row>
              <Row label="PAN / Passport / Tax ID">{signer.taxIdMasked}</Row>
              <Row label="Firm GSTIN / COA ID / Foreign Reg. No.">
                <input
                  aria-label="Firm GSTIN / COA ID / Foreign Reg. No."
                  className={inputClass}
                  maxLength={60}
                  onChange={(e) => setFirmRegistration(e.target.value)}
                  value={firmRegistration}
                />
              </Row>
              <Row label="Email (verified) and phone">
                {[signer.email, signer.phone].filter(Boolean).join(' · ')}
              </Row>
              <Row label="Business / studio address and PIN/ZIP">
                <textarea
                  aria-label="Business / studio address and PIN/ZIP"
                  className={inputClass}
                  maxLength={300}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  value={address}
                />
              </Row>
            </>
          ) : (
            <>
              <Row label="Full Legal Name (as per PAN)">{signer.name}</Row>
              <Row label="AT ID">{signer.memberCode}</Row>
              <Row label="PAN / Passport / Tax ID">{signer.taxIdMasked}</Row>
              <Row label="Email (verified) and phone">
                {[signer.email, signer.phone].filter(Boolean).join(' · ')}
              </Row>
              <Row label="Studio / residential address and PIN/ZIP">{signer.address}</Row>
            </>
          )}
        </dl>
        <p className="muted mt-3 text-base">
          {partner
            ? 'From your application and identity details. Please complete your firm’s details above. If anything else is wrong, write to us before signing.'
            : 'From your application and identity details. If anything is wrong, write to us before signing.'}
        </p>
      </section>

      <section aria-labelledby="photo-heading" className="grid gap-y-6">
        <h2 className="text-lg font-semibold" id="photo-heading">
          {agreement.photo.heading}
        </h2>
        <p className="measure">{agreement.photo.intro}</p>
        <ol className="measure grid list-decimal gap-y-2 pl-6">
          {agreement.photo.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {photo ? (
          <div className="grid gap-y-3">
            <p role="status">Your photo, taken with code {code}, was received and encrypted.</p>
            <div>
              <button
                className="link link-caps min-h-11"
                onClick={() => setPhoto(null)}
                type="button"
              >
                Take it again
              </button>
            </div>
          </div>
        ) : (
          <IdentityPhoto
            name={signer.name}
            onSent={() => setPhoto({ code: code ?? '' })}
            type={agreement.kind}
            via={{
              code: '/next/members/agreement',
              photo: '/next/members/agreement/photo',
              fields: { kind: agreement.kind, id },
            }}
            onCode={setCode}
          />
        )}
      </section>

      <section
        aria-labelledby="notice-heading"
        className="border-2 border-[var(--text)] p-6 sm:p-8"
      >
        <p id="notice-heading">
          <strong>{agreement.notice.heading}</strong> {agreement.notice.intro[0]}
        </p>
        <p className="mt-4">{agreement.notice.intro[1]}</p>
        <ol className="mt-4 grid list-decimal gap-y-3 pl-6">
          {agreement.notice.items.map((item) => {
            const [title, ...rest] = item.split(': ')
            return (
              <li key={item}>
                <strong>{title}:</strong> {rest.join(': ')}
              </li>
            )
          })}
        </ol>
      </section>

      <section aria-label="Declarations" className="grid gap-y-6">
        {[
          [terms, setTerms, agreement.checkboxes[0]],
          [privacy, setPrivacy, agreement.checkboxes[1]],
        ].map(([checked, set, text], i) => {
          const [title, ...rest] = (text as string).split(': ')
          return (
            <label className="flex cursor-pointer items-start gap-4" key={i}>
              <input
                checked={checked as boolean}
                className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--primary)]"
                onChange={(e) => (set as (v: boolean) => void)(e.target.checked)}
                required
                type="checkbox"
              />
              <span className="measure">
                <strong>{title}:</strong> {rest.join(': ')}
              </span>
            </label>
          )
        })}

        <div>
          <label className="mb-2 block font-semibold" htmlFor="agreement-typed">
            {agreement.inputLabel}
          </label>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            className="w-full max-w-xs border-0 border-b border-input bg-transparent px-0 py-2 text-[1.15rem] tracking-wider focus:border-primary focus:outline-none"
            id="agreement-typed"
            onChange={(e) => setTyped(e.target.value)}
            spellCheck={false}
            value={typed}
          />
        </div>

        <div>
          <button
            className="btn btn-solid min-h-11"
            disabled={!ready || busy}
            onClick={() => void sign()}
            type="button"
          >
            {agreement.button}
          </button>
          <p aria-live="polite" className="mt-3 text-base" role="status">
            {busy ? <Sending /> : message}
          </p>
        </div>

        <dl aria-label="What will be recorded" className="muted grid gap-y-1 font-mono text-sm">
          <div>
            <dt className="inline">ID: </dt>
            <dd className="inline">{signer.memberCode}</dd>
          </div>
          <div>
            <dt className="inline">IP: </dt>
            <dd className="inline">{status.ip}</dd>
          </div>
          <div>
            <dt className="inline">Timestamp: </dt>
            <dd className="inline">{now}</dd>
          </div>
          <div>
            <dt className="inline">Verification code: </dt>
            <dd className="inline">{photo ? code : '—'}</dd>
          </div>
          <div>
            <dd>{agreement.version}</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
