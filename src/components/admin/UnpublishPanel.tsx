'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { useActionDialog } from './ActionDialog'

/**
 * After a member withdraws consent: a prompt to staff, and the one click that takes their profile
 * and artworks down (POST /api/members/:id/unpublish, src/members/unpublish.ts). Shown only once
 * consent is withdrawn; afterwards it says when it was done.
 */
export const UnpublishPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const router = useRouter()
  const { dialog, ask } = useActionDialog()
  const withdrawnAt = useFormFields(
    ([fields]) => fields?.['consentWithdrawal.withdrawnAt']?.value as string | undefined,
  )
  const unpublishedAt = useFormFields(
    ([fields]) => fields?.['consentWithdrawal.unpublishedAt']?.value as string | undefined,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!id || !withdrawnAt) return null

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    })

  if (unpublishedAt) {
    return (
      <div style={{ marginBottom: 'var(--base)' }}>
        <p className="field-label">Consent withdrawn</p>
        <p>Profile and artworks unpublished from Phulhaar on {when(unpublishedAt)} IST.</p>
      </div>
    )
  }

  const unpublish = async () => {
    const answer = await ask({
      title: 'Unpublish their profile and artworks?',
      description:
        'Their approved profile is taken down and every picture of theirs is made private. Phulhaar no longer shows their profile or artworks. It is recorded with your name.',
      confirmLabel: 'Unpublish',
      danger: true,
    })
    if (!answer) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/members/${id}/unpublish`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'It could not be unpublished.')
    setMessage('Unpublished.')
    router.refresh()
  }

  return (
    <div
      role="alert"
      style={{
        marginBottom: 'var(--base)',
        padding: '0.75rem',
        border: '1px solid var(--theme-error-500)',
      }}
    >
      <p className="field-label">Consent withdrawn</p>
      <p style={{ marginBottom: '0.5rem' }}>
        They withdrew consent on {when(withdrawnAt)} IST. Unpublish their profile and artworks now.
      </p>
      <button
        className="btn btn--size-small btn--style-primary"
        disabled={busy}
        onClick={() => void unpublish()}
        type="button"
      >
        Unpublish Profile &amp; Artworks from Phulhaar
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
