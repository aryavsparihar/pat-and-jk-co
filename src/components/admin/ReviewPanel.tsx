'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

const WORDS: Record<string, string> = {
  none: 'Nothing waiting for review.',
  pending: 'Waiting for review.',
  approved: 'Approved and public.',
  'changes-requested': 'Waiting for the artist to make the changes you asked for.',
}

/**
 * Staff review of what an artist wants to show the public: their profile (members). Approving
 * publishes the version shown in the form; asking for changes sends the note to the artist. Both
 * are recorded in the security log. Nothing is public until approved.
 */
export const ReviewPanel: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const isProfile = collectionSlug === 'members'
  const group = isProfile ? 'profileReview' : 'review'
  const state = useFormFields(([fields]) => fields[`${group}.state`]?.value as string | undefined)
  const submittedAt = useFormFields(
    ([fields]) => fields[`${group}.submittedAt`]?.value as string | undefined,
  )
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!id) return null
  const what = isProfile ? 'profile' : 'work'

  const decide = async (decision: 'approve' | 'request-changes') => {
    if (decision === 'request-changes' && !note.trim()) {
      setMessage('Write a note to the artist first: it is emailed to them.')
      return
    }
    setBusy(true)
    setMessage(null)
    const path = isProfile ? 'profile-review' : 'review'
    const response = await fetch(`/api/${collectionSlug}/${id}/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note }),
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'The decision could not be saved.')
    setNote('')
    setMessage(
      decision === 'approve'
        ? `Approved. The ${what} is public, and the artist has been emailed.`
        : 'Sent. The artist has been emailed your note.',
    )
    router.refresh()
  }

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      <p className="field-label">{isProfile ? 'Profile review' : 'Review'}</p>
      <p>
        {WORDS[state ?? 'none'] ?? state}
        {state === 'pending' && submittedAt
          ? ` Sent on ${new Date(submittedAt).toLocaleDateString('en-IN')}.`
          : ''}
      </p>
      {state === 'pending' && (
        <>
          <p style={{ opacity: 0.7, margin: 'var(--base) 0 0.5rem' }}>
            Check the {what} below, then approve it to make it public, or ask for changes.
          </p>
          <label className="field-label" htmlFor="review-note">
            Note to the artist
          </label>
          <textarea
            id="review-note"
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{ width: '100%', marginBottom: '0.5rem' }}
            value={note}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              className="btn btn--style-primary btn--size-small"
              disabled={busy}
              onClick={() => decide('approve')}
              type="button"
            >
              Approve and publish
            </button>
            <button
              className="btn btn--style-secondary btn--size-small"
              disabled={busy}
              onClick={() => decide('request-changes')}
              type="button"
            >
              Ask for changes
            </button>
          </div>
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
