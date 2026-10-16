'use client'

import React, { useState } from 'react'

import { api } from '../onboarding/api'
import { TextField } from '../onboarding/fields'
import { Sending } from '../onboarding/Sending'

/**
 * The link to the artist's Google Drive folder. Only a Google Drive folder link is taken; the
 * server checks it again and keeps it in one plain form.
 */
export const WorksFolderForm: React.FC<{ initial: string | null }> = ({ initial }) => {
  const [url, setUrl] = useState(initial ?? '')
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const result = await api<{ worksFolder: string | null }>('/next/members/portal/works-folder', {
      body: { url },
    })
    setBusy(false)
    if (!result.ok) {
      // The reason for the link itself, when there is one, rather than the general message
      const reason = (result.data as { errors?: Record<string, string> }).errors?.url
      setMessage({
        ok: false,
        text: reason ?? result.data.message ?? 'The link could not be saved.',
      })
      return
    }
    setSaved(result.data.worksFolder)
    setUrl(result.data.worksFolder ?? '')
    setMessage({
      ok: true,
      text: result.data.worksFolder
        ? 'Saved. Our team has been told where to find your works.'
        : 'The link has been removed.',
    })
  }

  return (
    <form className="measure" noValidate onSubmit={save}>
      <TextField
        errors={message && !message.ok ? { worksFolder: message.text } : {}}
        hint="The link to the folder, starting https://drive.google.com/drive/folders/"
        inputMode="url"
        label="Your Google Drive folder"
        maxLength={400}
        name="worksFolder"
        onValue={setUrl}
        optional
        type="url"
        value={url}
      />
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <button className="btn btn-solid min-h-11" disabled={busy} type="submit">
          {busy ? <Sending label="Saving" /> : 'Save the link'}
        </button>
        {saved && (
          <a
            className="link min-h-11 content-center"
            href={saved}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open your folder
          </a>
        )}
      </div>
      <p aria-live="polite" className="mt-4 text-base text-primary" role="status">
        {message?.ok ? message.text : ''}
      </p>
    </form>
  )
}
