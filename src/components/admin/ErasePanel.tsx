'use client'

import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { useActionDialog } from './ActionDialog'

type Preview = {
  erased: boolean
  confirm: string | null
  placeholder: string | null
  /** Staff accounts: this is your own */
  self?: boolean
  /** Members */
  requestedAt?: string | null
  kyc?: 'purged' | 'kept' | 'none'
  holdUntil?: string | null
  worksArchived?: number
  worksRemoved?: number
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * "Delete this person", for super admins, on a member or a staff account. Says what will happen
 * before anything does, then asks for the ID typed out and a reason, which go to the security
 * log. The record stays, emptied, as "Deleted artist (AT000012)" or "Deleted staff (ST-0007)"
 * (POST /api/{members|users}/:id/erase, src/people/erase.ts; docs/ADMIN_GUIDE.md)
 */
export const ErasePanel: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const { user } = useAuth()
  const router = useRouter()
  const { dialog, ask } = useActionDialog()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const superAdmin = ((user as { roles?: string[] } | null)?.roles ?? []).includes('super-admin')
  const base = id && collectionSlug ? `/api/${collectionSlug}/${id}/erase` : null

  useEffect(() => {
    if (!superAdmin || !base) return
    let live = true
    fetch(base, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Preview | null) => live && setPreview(p))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [base, superAdmin])

  if (!superAdmin || !base || !preview || preview.erased || !preview.confirm) return null

  const member = collectionSlug === 'members'
  const consequences = member
    ? [
        'Their name, email, phone, address, profile, portrait and sessions are erased, and they can no longer sign in. Their answers on every application are emptied; the references, decisions and dates stay.',
        preview.worksArchived
          ? `${preview.worksArchived} approved work(s) are archived and kept as the record of what was shown. Take them off Shopify if they are there.`
          : null,
        preview.worksRemoved ? `${preview.worksRemoved} work(s) never approved are removed.` : null,
        preview.kyc === 'kept'
          ? `Their identity and payout details stay, encrypted, under the legal hold until ${day(preview.holdUntil!)}.`
          : preview.kyc === 'purged'
            ? 'Their identity and payout details are deleted, documents included. If we have paid them, set a legal hold on their KYC first.'
            : null,
        `They are shown as “${preview.placeholder}” wherever they appear, and the security log keeps every entry under that name. They are emailed that their account has been deleted.`,
      ].filter(Boolean)
    : [
        'Their name, email, password, brands and sessions are erased, and the account can never sign in again.',
        `They are shown as “${preview.placeholder}” wherever they appear, and the security log keeps every entry under that name.`,
      ]

  const erase = async () => {
    const answer = await ask({
      title: 'Delete this person',
      description: `${consequences.join(' ')} This cannot be undone.`,
      typed: { label: 'To confirm, type their ID', expect: preview.confirm! },
      reason: {
        label: 'Why',
        hint: preview.requestedAt
          ? `For example: "Their own request of ${day(preview.requestedAt)}, through their account." Recorded in the security log with your name.`
          : 'For example: "Asked by email on 3 March to delete their account." Recorded in the security log with your name.',
      },
      confirmLabel: 'Delete and erase',
      danger: true,
    })
    if (!answer) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(base, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: answer.typed, reason: answer.reason }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      message?: string
      placeholder?: string
    }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'They could not be deleted.')
    setMessage(`Done. They are now “${body.placeholder}”.`)
    router.refresh()
  }

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <p className="field-label">Delete this person</p>
      {preview.requestedAt && (
        <p style={{ margin: '0 0 0.5rem' }}>
          They asked to be deleted on {day(preview.requestedAt)}, through their account.
        </p>
      )}
      {preview.self ? (
        <p style={{ margin: 0, opacity: 0.75 }}>You cannot delete your own account.</p>
      ) : (
        <button
          className="btn btn--size-small pjk-btn-danger"
          disabled={busy}
          onClick={() => void erase()}
          type="button"
        >
          Delete and erase their details
        </button>
      )}
      {message && (
        <p role="status" style={{ marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
      {dialog}
    </div>
  )
}
