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

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
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

      {message && (
        <p role="status" style={{ marginTop: 'var(--base)' }}>
          {message}
        </p>
      )}
    </div>
  )
}
