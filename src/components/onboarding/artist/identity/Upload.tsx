'use client'

import React, { useState } from 'react'

import { api } from '../../api'
import { Sending } from '../../Sending'
import { useStepUp } from '../../StepUp'
import { FilePreview } from './FilePreview'

export type DocKind =
  'pan-card' | 'masked-aadhaar' | 'other-id' | 'address-proof' | 'bank-proof' | 'identity-photo'

export const DOC_LABEL: Record<DocKind, string> = {
  'pan-card': 'PAN card',
  'masked-aadhaar': 'Masked e-Aadhaar',
  'other-id': 'Your ID',
  'address-proof': 'Proof of address',
  'bank-proof': 'Cancelled cheque or passbook',
  'identity-photo': 'Photo of you holding the paper',
}

const MAX_UPLOAD = 4 * 1024 * 1024

/** Photos are made smaller in the browser so they stay under the upload limit; PDFs go as they are */
export const shrink = async (file: Blob): Promise<Blob> => {
  if (!file.type.startsWith('image/') || file.size <= 3 * 1024 * 1024) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.88),
  )
}

/** One upload, sent straight to the server, encrypted there before it is kept */
export const Upload: React.FC<{
  kind: DocKind
  hint?: string
  optional?: boolean
  value?: number
  error?: string
  /** A photograph only, not a PDF */
  photo?: boolean
  /** For a protected PDF's preview: the password the artist has typed */
  password?: string
  /** Whose application it is for: an artist's, or a partner's */
  type?: 'artist' | 'partner'
  onUploaded: (id: number) => void
}> = ({ kind, hint, optional, value, error, photo, password, type = 'artist', onUploaded }) => {
  const [state, setState] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The chosen file, kept in this page only, to preview
  const [file, setFile] = useState<File | null>(null)
  const { guard } = useStepUp()
  const id = `field-documents-${kind}`
  const send = async (chosen: File | undefined) => {
    if (!chosen) return
    setFile(chosen)
    setBusy(true)
    setState(null)
    const body = await shrink(chosen)
    if (body.size > MAX_UPLOAD) {
      setBusy(false)
      return setState('That file is larger than 4 MB. Please send a smaller copy or a photo.')
    }
    const form = new FormData()
    form.append('kind', kind)
    form.append('type', type)
    form.append('file', body, chosen.name)
    const result = await guard(() =>
      api<{ document: { id: number } }>('/next/members/kyc/document', { body: form }),
    )
    setBusy(false)
    if (!result.ok) return setState(result.data.message ?? 'That file could not be sent.')
    onUploaded(result.data.document.id)
    setState('Received, and encrypted.')
  }
  return (
    <div>
      <p className="label mb-1">
        {DOC_LABEL[kind]}
        {optional && (
          <span className="ml-2 normal-case tracking-normal text-muted-foreground">(optional)</span>
        )}
      </p>
      {hint && <p className="muted measure mb-2 text-base">{hint}</p>}
      <label className="btn btn-outline mt-1 min-h-11 cursor-pointer" htmlFor={id}>
        {value || file ? 'Choose another file' : 'Choose a file'}
      </label>
      <input
        accept={
          photo
            ? 'image/jpeg,image/png,image/webp'
            : 'image/jpeg,image/png,image/webp,application/pdf'
        }
        aria-describedby={error ? `${id}-error` : undefined}
        className="sr-only"
        disabled={busy}
        id={id}
        onChange={(e) => send(e.target.files?.[0])}
        type="file"
      />
      <FilePreview file={file} label={DOC_LABEL[kind]} password={password} />
      <p aria-live="polite" className="mt-2 text-base" role="status">
        {busy ? <Sending /> : (state ?? (value ? 'Received, and encrypted.' : ''))}
      </p>
      {error && (
        <p className="text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}
