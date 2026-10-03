'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'

const LABELS: Record<string, string> = {
  pan: 'PAN',
  panName: 'Name on PAN',
  aadhaarLast4: 'Aadhaar, last four',
  holderName: 'Account holder',
  accountNumber: 'Account number',
  ifsc: 'IFSC',
  branchName: 'Branch',
  pendingHolderName: 'New: account holder',
  pendingAccountNumber: 'New: account number',
  pendingIfsc: 'New: IFSC',
  pendingBranchName: 'New: branch',
}

const KIND_LABELS: Record<string, string> = {
  'pan-card': 'PAN card',
  'masked-aadhaar': 'Masked Aadhaar',
  'address-proof': 'Proof of address',
  'bank-proof': 'Cheque or passbook',
}

const ask = (what: string) =>
  window.prompt(`Why do you need to ${what}? This is recorded in the security log with your name.`)

/**
 * The KYC record's sidebar: reveal the full values, open the documents, approve a change of bank
 * details. Every reveal and every document asks for a reason, which the server records. Revealed
 * values are held only in this component's memory and wiped after a minute, or when the page is
 * left; nothing is written to storage, and the responses are never cached.
 */
export const KycPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const documents = useFormFields(
    ([fields]) => (fields.documents?.value as number[] | undefined) ?? [],
  )
  const pendingSince = useFormFields(
    ([fields]) => fields['pendingBank.requestedAt']?.value as string | undefined,
  )
  const withdrawnAt = useFormFields(
    ([fields]) => fields.consentWithdrawnAt?.value as string | undefined,
  )
  const holdUntil = useFormFields(([fields]) => fields.legalHoldUntil?.value as string | undefined)
  const idChoice = useFormFields(([fields]) => fields.idChoice?.value as string | undefined)
  const check = useFormFields(([fields]) => ({
    result: fields['aadhaarCheck.result']?.value as string | undefined,
    reasons: fields['aadhaarCheck.reasons']?.value as string | undefined,
    signer: fields['aadhaarCheck.signer']?.value as string | undefined,
    signedOn: fields['aadhaarCheck.signedOn']?.value as string | undefined,
    checkedAt: fields['aadhaarCheck.checkedAt']?.value as string | undefined,
    mode: fields['aadhaarCheck.mode']?.value as string | undefined,
  }))
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string> | null>(null)
  const [left, setLeft] = useState(0)
  const [kinds, setKinds] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const hide = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setValues(null)
    setLeft(0)
  }

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    [],
  )

  const ids = documents.join(',')
  useEffect(() => {
    if (!ids) return
    let current = true
    void fetch(`/api/kyc-documents?where[id][in]=${ids}&depth=0&limit=50`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((body: { docs?: { id: number; kind: string }[] }) => {
        if (current) setKinds(Object.fromEntries((body.docs ?? []).map((d) => [d.id, d.kind])))
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [ids])

  if (!id) return null

  const reveal = async () => {
    const reason = ask('see the full details')
    if (!reason) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/kyc-records/${id}/reveal`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      values?: Record<string, string>
      hideAfterSeconds?: number
      message?: string
    }
    setBusy(false)
    if (!response.ok || !body.values)
      return setMessage(body.message ?? 'The details could not be shown.')
    setValues(body.values)
    setLeft(body.hideAfterSeconds ?? 60)
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          hide()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  const download = async (documentId: number) => {
    const reason = ask('open this document')
    if (!reason) return
    setMessage(null)
    const response = await fetch(`/api/kyc-documents/${documentId}/download`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      return setMessage(body.message ?? 'The document could not be opened.')
    }
    const name =
      /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
      'document'
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const approve = async () => {
    if (
      !window.confirm(
        'Approve the new bank details? Check them against the documents first. Payments will go to the new account from now on.',
      )
    )
      return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/kyc-records/${id}/approve-bank-change`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'The change could not be approved.')
    hide()
    setMessage('Approved. The new bank details are now in force.')
    router.refresh()
  }

  /** A logged staff action on the record: POST with a reason, then reload the record */
  const act = async (path: string, body: Record<string, unknown>, done: string) => {
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/kyc-records/${id}/${path}`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const reply = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(reply.message ?? 'That could not be done.')
    setMessage(done)
    router.refresh()
  }

  const recordWithdrawal = async () => {
    if (
      !window.confirm(
        'Record that the artist has withdrawn consent? Use this only for a withdrawal that reached us by letter or email. The record will be deleted at the next purge unless a legal hold applies.',
      )
    )
      return
    const reason = ask('record this withdrawal (how and when it reached us)')
    if (!reason) return
    await act('record-withdrawal', { reason }, 'The withdrawal is recorded.')
  }

  const changeLegalHold = async () => {
    const until = window.prompt(
      'Keep this record until which date? YYYY-MM-DD, or leave empty to lift the hold.',
      holdUntil ? holdUntil.slice(0, 10) : '',
    )
    if (until === null) return
    const reason = ask(until.trim() ? 'set this legal hold' : 'lift this legal hold')
    if (!reason) return
    await act('legal-hold', { until: until.trim() || null, reason }, 'The legal hold is changed.')
  }

  const CHECK_WORDS: Record<string, { label: string; colour: string }> = {
    verified: { label: 'Verified', colour: 'var(--theme-success-500)' },
    'not-verified': { label: 'Could not verify', colour: 'var(--theme-error-500)' },
    'manual-review': { label: 'Needs a check by hand', colour: 'var(--theme-warning-500)' },
  }

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      <p className="field-label">Identity document</p>
      {idChoice === 'other' ? (
        <p style={{ marginBottom: 'var(--base)' }}>
          Another ID, to be checked by hand against the PAN and the application.
        </p>
      ) : idChoice === 'aadhaar' ? (
        <div style={{ marginBottom: 'var(--base)' }} role="status">
          {check.result ? (
            <>
              <p>
                <strong style={{ color: CHECK_WORDS[check.result]?.colour }}>
                  {CHECK_WORDS[check.result]?.label ?? check.result}
                </strong>{' '}
                <span style={{ opacity: 0.7 }}>
                  ({check.mode === 'enforcing' ? 'enforcing' : 'advisory'}
                  {check.checkedAt
                    ? `, ${new Date(check.checkedAt).toLocaleDateString('en-IN')}`
                    : ''}
                  )
                </span>
              </p>
              {check.reasons && (
                <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.1rem' }}>
                  {check.reasons.split('\n').map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              {check.signer && (
                <p style={{ opacity: 0.7, marginTop: '0.25rem' }}>
                  Signed by {check.signer}
                  {check.signedOn ? ` on ${check.signedOn}` : ''}
                </p>
              )}
            </>
          ) : (
            <p style={{ opacity: 0.7 }}>The masked e-Aadhaar has not been checked yet.</p>
          )}
          <p style={{ opacity: 0.7, marginTop: '0.25rem' }}>
            Whatever this says, check the name, date of birth, photo and last four digits by hand.
          </p>
        </div>
      ) : null}

      <p className="field-label">Full details</p>
      {values ? (
        <div>
          <dl style={{ display: 'grid', gap: '0.35rem', margin: 'var(--base) 0' }}>
            {Object.entries(values).map(([key, value]) => (
              <div key={key}>
                <dt style={{ opacity: 0.7, fontSize: '0.85em' }}>{LABELS[key] ?? key}</dt>
                <dd style={{ margin: 0, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p style={{ opacity: 0.7 }} role="status">
            Hidden again in {left} s.
          </p>
          <button className="btn btn--style-secondary btn--size-small" onClick={hide} type="button">
            Hide now
          </button>
        </div>
      ) : (
        <button
          className="btn btn--style-secondary btn--size-small"
          disabled={busy}
          onClick={reveal}
          type="button"
        >
          Reveal full details
        </button>
      )}

      {documents.length > 0 && (
        <>
          <p className="field-label" style={{ marginTop: 'var(--base)' }}>
            Documents
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {documents.map((documentId) => (
              <li key={documentId}>
                <button
                  className="btn btn--style-secondary btn--size-small"
                  onClick={() => download(documentId)}
                  type="button"
                >
                  Download {KIND_LABELS[kinds[documentId] ?? ''] ?? `document ${documentId}`}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingSince && (
        <>
          <p className="field-label" style={{ marginTop: 'var(--base)' }}>
            Change of bank details
          </p>
          <p>
            Asked for on {new Date(pendingSince).toLocaleDateString('en-IN')}. Reveal the details to
            check the new account, then approve.
          </p>
          <button
            className="btn btn--style-primary btn--size-small"
            disabled={busy}
            onClick={approve}
            type="button"
          >
            Approve the new details
          </button>
        </>
      )}

      <p className="field-label" style={{ marginTop: 'var(--base)' }}>
        Consent and retention
      </p>
      <p style={{ opacity: 0.8 }}>
        These dates cannot be edited. Each change below asks for a reason and goes to the security
        log.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {!withdrawnAt && (
          <button
            className="btn btn--style-secondary btn--size-small"
            disabled={busy}
            onClick={recordWithdrawal}
            type="button"
          >
            Record a withdrawal
          </button>
        )}
        <button
          className="btn btn--style-secondary btn--size-small"
          disabled={busy}
          onClick={changeLegalHold}
          type="button"
        >
          {holdUntil ? 'Change the legal hold' : 'Set a legal hold'}
        </button>
      </div>

      {message && (
        <p role="status" style={{ marginTop: 'var(--base)' }}>
          {message}
        </p>
      )}
    </div>
  )
}
