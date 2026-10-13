'use client'

import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { useActionDialog } from './ActionDialog'

/**
 * For a member who has lost access to their email: a KYC reviewer, having checked who they are
 * against the identity details on file, changes the address for them. The reason and the
 * reviewer's name go to the security log, every session ends, and both addresses are told.
 * (POST /api/members/:id/change-email, src/members/account.ts; docs/ADMIN_GUIDE.md)
 */
export const EmailRecoveryPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const router = useRouter()
  const { dialog, ask } = useActionDialog()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const roles = ((user as { roles?: string[] } | null)?.roles ?? []) as string[]
  if (!id || !roles.some((r) => r === 'kyc-reviewer' || r === 'super-admin')) return null

  const change = async () => {
    const answer = await ask({
      title: 'Change the email address',
      description:
        'Only for a member who has lost access to their email, and only after you have checked who they are against the identity details on file: the name and date of birth on their PAN and ID, and their photo. Every device they are signed in on is signed out, and both addresses are emailed.',
      email: { label: 'New email address' },
      reason: {
        label: 'How you checked their identity',
        hint: 'For example: "Phoned the number on file; name, date of birth and PAN match the KYC record." Recorded in the security log with your name.',
      },
      attest: { label: 'I have checked their identity against the KYC record on file.' },
      confirmLabel: 'Change the address',
      danger: true,
    })
    if (!answer) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/members/${id}/change-email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: answer.email, reason: answer.reason }),
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'The address could not be changed.')
    setMessage('Done. Both addresses have been emailed, and the member is signed out everywhere.')
    router.refresh()
  }

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <p className="field-label">Lost access to their email</p>
      <button
        className="btn btn--style-secondary btn--size-small"
        disabled={busy}
        onClick={() => void change()}
        type="button"
      >
        Change the email address
      </button>
      {message && (
        <p role="status" style={{ marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
      {dialog}
    </div>
  )
}
