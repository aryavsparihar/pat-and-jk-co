'use client'

import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'

import { curatorEmailDraft, type CuratorEmailKind } from '@/curators/drafts'

type Curator = {
  id: number
  reference: string
  fullName: string
  keepOnFile: boolean
  project: string
}

const post = async (url: string, body: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as { message?: string }
  return { ok: response.ok, message: data.message }
}

const field: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  font: 'inherit',
  boxSizing: 'border-box',
}

/**
 * The buttons of the Curators screen. Each letter opens first, as the design asks, so it can be
 * read and edited before it goes; the status changes only once it has been sent.
 */
export const CuratorActions: React.FC<{ application: Curator }> = ({ application }) => {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<CuratorEmailKind | 'project' | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [project, setProject] = useState(application.project)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const open = (next: CuratorEmailKind | 'project') => {
    setMode(next)
    setMessage(null)
    if (next !== 'project') {
      const draft = curatorEmailDraft(next, application)
      setSubject(draft.subject)
      setBody(draft.body)
    } else setProject(application.project)
    dialog.current?.showModal()
  }

  const close = () => {
    dialog.current?.close()
    setMode(null)
  }

  const confirm = async () => {
    setBusy(true)
    setMessage(null)
    const result =
      mode === 'project'
        ? await post(`/api/applications/${application.id}/curator-project`, { project })
        : await post(`/api/applications/${application.id}/curator-email`, {
            kind: mode,
            subject,
            body,
          })
    setBusy(false)
    if (!result.ok) return setMessage(result.message ?? 'That could not be done. Please try again.')
    close()
    router.refresh()
  }

  const title =
    mode === 'talk'
      ? 'Send “We would like to talk”'
      : mode === 'decline'
        ? 'Send “Not this time”'
        : 'Add to a project'

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          className="btn btn--style-primary btn--size-small"
          onClick={() => open('talk')}
          type="button"
        >
          Send “We would like to talk”
        </button>
        <button
          className="btn btn--style-secondary btn--size-small"
          onClick={() => open('decline')}
          type="button"
        >
          Send “Not this time”
        </button>
        <button
          className="btn btn--style-secondary btn--size-small"
          onClick={() => open('project')}
          type="button"
        >
          Add to a project
        </button>
      </div>
      <p style={{ marginTop: '0.75rem', fontSize: 14, opacity: 0.75 }}>
        Each button opens the email first, so it can be read and edited before it goes. The status
        changes once it is sent.
      </p>

      <dialog
        aria-labelledby="curator-dialog-title"
        onClose={() => setMode(null)}
        ref={dialog}
        style={{ width: 'min(680px, calc(100vw - 32px))', padding: '1.5rem' }}
      >
        <h2 id="curator-dialog-title" style={{ marginTop: 0 }}>
          {title}
        </h2>
        {mode === 'project' ? (
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Project name</span>
            <input
              maxLength={120}
              onChange={(e) => setProject(e.target.value)}
              placeholder="For example, First collection"
              style={field}
              value={project}
            />
            <span style={{ fontSize: 13, opacity: 0.7 }}>
              Saving a project marks them Working with us. Leave it empty to take them off it.
            </span>
          </label>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
              From PAT &amp; J.K. Co. &lt;noreply@pjk.co.in&gt;, signed by the founder, with a blind
              copy to business@. {application.reference} is added at the foot.
            </p>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Subject</span>
              <input
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
                style={field}
                value={subject}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Message</span>
              <textarea
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                style={{ ...field, lineHeight: 1.55 }}
                value={body}
              />
              <span style={{ fontSize: 13, opacity: 0.7 }}>
                Leave a blank line between paragraphs.
              </span>
            </label>
          </div>
        )}
        {message && (
          <p role="alert" style={{ color: 'var(--theme-error-500)' }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            className="btn btn--style-primary btn--size-small"
            disabled={busy}
            onClick={confirm}
            type="button"
          >
            {busy ? 'Working…' : mode === 'project' ? 'Save' : 'Send it'}
          </button>
          <button
            className="btn btn--style-secondary btn--size-small"
            onClick={close}
            type="button"
          >
            Cancel
          </button>
        </div>
      </dialog>
    </div>
  )
}

/** "Add a note": kept with who wrote it and when, for the team only */
export const CuratorNotes: React.FC<{ id: number }> = ({ id }) => {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const add = async () => {
    setBusy(true)
    setMessage(null)
    const result = await post(`/api/applications/${id}/curator-note`, { note })
    setBusy(false)
    if (!result.ok) return setMessage(result.message ?? 'The note could not be added.')
    setNote('')
    router.refresh()
  }
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 680, marginTop: '1rem' }}>
      <label htmlFor={`curator-note-${id}`}>Add a note</label>
      <textarea
        id={`curator-note-${id}`}
        maxLength={2000}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        style={field}
        value={note}
      />
      {message && (
        <p role="alert" style={{ color: 'var(--theme-error-500)', margin: 0 }}>
          {message}
        </p>
      )}
      <div>
        <button
          className="btn btn--style-secondary btn--size-small"
          disabled={busy || !note.trim()}
          onClick={add}
          type="button"
        >
          {busy ? 'Adding…' : 'Add the note'}
        </button>
      </div>
    </div>
  )
}
