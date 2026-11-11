'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'

import { useActionDialog } from './ActionDialog'

const SIGNER = { artist: 'Artist', partner: 'Trade Partner' } as const

/**
 * A signed agreement's sidebar. Download the PDF as the member signed it (and their live photo),
 * countersign it with PAT & J.K. Co.'s DSC outside the site, then upload the countersigned PDF
 * here: it is kept, the record is locked, and the PDF is emailed to the signer and compliance.
 * Every download asks for a reason, which the server records (src/agreements/staff.ts).
 */
export const AgreementPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const state = useFormFields(([fields]) => fields.state?.value as string | undefined)
  const kind = useFormFields(([fields]) => fields.kind?.value as 'artist' | 'partner' | undefined)
  const hasPhoto = useFormFields(([fields]) => Boolean(fields.photo?.value))
  const router = useRouter()
  const { dialog, ask } = useActionDialog()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!id || !kind) return null
  const signer = SIGNER[kind]

  const download = async (file: 'signed' | 'countersigned' | 'photo') => {
    const answer = await ask({
      title: file === 'photo' ? 'Download the live photo' : 'Download this PDF',
      description:
        'It downloads to your computer. Delete it when you are done, and never forward it. Your name and reason go in the security log.',
      confirmLabel: 'Download',
      reason: { label: 'Why do you need to open it?' },
    })
    if (!answer) return
    setMessage(null)
    const response = await fetch(`/api/agreement-executions/${id}/download`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, reason: answer.reason }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      return setMessage(body.message ?? 'The file could not be opened.')
    }
    const name =
      /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? file
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const upload = async (file: File) => {
    const sure = await ask({
      title: `Send the countersigned agreement to the ${signer}`,
      description: `"${file.name}" is kept as the executed agreement, the record is locked, and the PDF is emailed to the ${signer} and to compliance@pjk.co.in. It cannot be replaced afterwards.`,
      confirmLabel: 'Upload and send',
    })
    if (!sure) return
    setBusy(true)
    setMessage(null)
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(`/api/agreement-executions/${id}/countersign`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      body: form,
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    setMessage(body.message ?? (response.ok ? 'Done.' : 'The upload did not work.'))
    if (response.ok) router.refresh()
  }

  const button = 'btn btn--style-secondary btn--size-small'
  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      {dialog}
      <p className="field-label">Agreement</p>
      {state === 'in-progress' && <p>Not signed yet: the {signer} is still signing.</p>}
      {state !== 'in-progress' && (
        <button className={button} onClick={() => void download('signed')} type="button">
          Download {signer}-Signed PDF
        </button>
      )}
      {hasPhoto && (
        <button className={button} onClick={() => void download('photo')} type="button">
          Download the live photo
        </button>
      )}
      {state === 'pending-countersignature' && (
        <>
          <input
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void upload(file)
            }}
            ref={input}
            type="file"
          />
          <button
            className="btn btn--style-primary btn--size-small"
            disabled={busy}
            onClick={() => input.current?.click()}
            type="button"
          >
            Upload Final DSC-Countersigned PDF &amp; Send to {signer}
          </button>
        </>
      )}
      {state === 'executed' && (
        <button className={button} onClick={() => void download('countersigned')} type="button">
          Download the countersigned PDF
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
