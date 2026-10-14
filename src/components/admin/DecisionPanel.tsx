'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

/**
 * The staff decision on an application, in its sidebar: start reviewing it (so the applicant sees
 * it is being read), approve, ask for changes, or decline, with a note to the applicant. Approving issues the AT or PT member ID and emails the applicant; every
 * decision is recorded in the security log against the member of staff who took it.
 * (POST /api/applications/:id/decide, src/members/decide.ts)
 */
export const DecisionPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const stage = useFormFields(([fields]) => fields.stage?.value as string | undefined)
  const issued = useFormFields(([fields]) => fields.issuedId?.value as string | undefined)
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!id) return null
  const decidable =
    stage === 'submitted' || stage === 'under-review' || stage === 'changes-requested'

  if (stage === 'rejected') return <Declined id={id} />

  if (!decidable) {
    const words: Record<string, string> = {
      draft: 'Still being filled in by the applicant. Nothing to decide yet.',
      approved: `Approved${issued ? `. Member ID ${issued}.` : '.'}`,
      rejected: 'Declined. The applicant has been told.',
      withdrawn: 'Withdrawn by the applicant. Nothing to decide.',
    }
    return (
      <div style={{ marginBottom: 'var(--base)' }}>
        <p className="field-label">Decision</p>
        <p>{words[stage ?? ''] ?? '—'}</p>
      </div>
    )
  }

  const startReview = async () => {
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/applications/${id}/decide`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'review' }),
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'That could not be saved.')
    setMessage('Marked as under review. The applicant sees it is being read.')
    router.refresh()
  }

  const decide = async (decision: 'approve' | 'reject' | 'request-changes') => {
    if (decision !== 'approve' && !note.trim()) {
      setMessage('Write a note to the applicant first: it is sent to them with the decision.')
      return
    }
    const confirmations = {
      approve: 'Approve this application? A member ID will be issued and the applicant emailed.',
      reject: 'Decline this application? The applicant will be emailed your note.',
      'request-changes':
        'Ask for changes? The applicant will be emailed your note and can edit their application again.',
    }
    if (!window.confirm(confirmations[decision])) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/applications/${id}/decide`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      message?: string
      memberId?: string
    }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'The decision could not be saved.')
    setMessage(
      body.memberId
        ? `Approved. Member ID ${body.memberId}.`
        : 'Done. The applicant has been emailed.',
    )
    router.refresh()
  }

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      <p className="field-label">Decision</p>
      {stage === 'changes-requested' && (
        <p style={{ marginBottom: 'var(--base)' }}>
          Waiting for the applicant to make the changes you asked for.
        </p>
      )}
      {stage === 'submitted' && (
        <div style={{ marginBottom: 'var(--base)' }}>
          <p style={{ marginBottom: '0.5rem' }}>
            Reading it now? Mark it, so the applicant can see it is being read. Nobody is emailed.
          </p>
          <button
            className="btn btn--style-secondary btn--size-small"
            disabled={busy}
            onClick={() => void startReview()}
            type="button"
          >
            Start reviewing
          </button>
        </div>
      )}
      <label className="field-label" htmlFor="decision-note">
        Note to the applicant
      </label>
      <textarea
        id="decision-note"
        onChange={(e) => setNote(e.target.value)}
        rows={5}
        style={{ width: '100%', marginBottom: 'var(--base)' }}
        value={note}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {stage !== 'changes-requested' && (
          <button
            className="btn btn--style-primary btn--size-small"
            disabled={busy}
            onClick={() => decide('approve')}
            type="button"
          >
            Approve
          </button>
        )}
        {stage !== 'changes-requested' && (
          <button
            className="btn btn--style-secondary btn--size-small"
            disabled={busy}
            onClick={() => decide('request-changes')}
            type="button"
          >
            Ask for changes
          </button>
        )}
        <button
          className="btn btn--style-secondary btn--size-small"
          disabled={busy}
          onClick={() => decide('reject')}
          type="button"
        >
          Decline
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

/** A declined application: when they may apply again, and a way to let them now */
const Declined: React.FC<{ id: number | string }> = ({ id }) => {
  const reapplyFrom = useFormFields(([fields]) => fields.reapplyFrom?.value as string | undefined)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const from = reapplyFrom ? new Date(reapplyFrom) : null
  // eslint-disable-next-line react-hooks/purity -- read once per render, to say whether the wait is over
  const waiting = from ? from.getTime() > Date.now() : false

  const allow = async () => {
    if (!window.confirm('Let this applicant apply again now? Their wait ends today.')) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/applications/${id}/allow-reapply`, {
      method: 'POST',
      credentials: 'include',
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'That could not be done.')
    setMessage('Done. They can apply again when they next sign in.')
    router.refresh()
  }

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <p className="field-label">Decision</p>
      <p>Declined. The applicant has been told.</p>
      {from && (
        <p style={{ marginTop: '0.5rem' }}>
          {waiting
            ? `They may apply again from ${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'They may apply again now.'}
        </p>
      )}
      {(waiting || !from) && (
        <button
          className="btn btn--style-secondary btn--size-small"
          disabled={busy}
          onClick={() => void allow()}
          style={{ marginTop: 'var(--base)' }}
          type="button"
        >
          Allow them to apply again now
        </button>
      )}
      {message && (
        <p role="status" style={{ marginTop: 'var(--base)' }}>
          {message}
        </p>
      )}
    </div>
  )
}
