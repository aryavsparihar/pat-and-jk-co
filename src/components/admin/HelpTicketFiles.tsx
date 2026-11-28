'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

/**
 * The files sent with a Help Center request or a contact message, on its record. Pictures show
 * here; each file opens in a new tab, decrypted by the collection's own route for the signed-in
 * staff member.
 */

type File = { filename: string; contentType: string; size?: number | null }

const size = (bytes?: number | null) =>
  !bytes
    ? ''
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const kindOf = (type: string) =>
  type === 'application/pdf' ? 'PDF' : type.startsWith('image/') ? 'Picture' : 'Word document'

const StoredFiles: React.FC<{ collection: string; label: string; none: string }> = ({
  collection,
  label,
  none,
}) => {
  const { id } = useDocumentInfo()
  const [files, setFiles] = useState<File[] | null>(null)

  useEffect(() => {
    if (!id) return
    void fetch(`/api/${collection}/${id}?depth=0`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => setFiles((doc?.attachments as File[]) ?? []))
      .catch(() => setFiles([]))
  }, [collection, id])

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <label className="field-label">{label}</label>
      {files === null ? (
        <p>Loading…</p>
      ) : files.length === 0 ? (
        <p>{none}</p>
      ) : (
        <ul
          style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--base)' }}
        >
          {files.map((file, n) => {
            const url = `/api/${collection}/${id}/files/${n}`
            return (
              <li key={n}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {file.filename}
                </a>{' '}
                <span style={{ opacity: 0.7 }}>
                  {kindOf(file.contentType)}
                  {file.size ? `, ${size(file.size)}` : ''}
                </span>
                {file.contentType.startsWith('image/') && file.contentType !== 'image/heic' && (
                  <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={file.filename}
                        style={{
                          maxWidth: '100%',
                          maxHeight: 320,
                          border: '1px solid var(--theme-elevation-150)',
                        }}
                      />
                    </a>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export const HelpTicketFiles: React.FC = () => (
  <StoredFiles
    collection="help-tickets"
    label="Files sent with the request"
    none="No files were sent with this request."
  />
)

export const EnquiryFiles: React.FC = () => (
  <StoredFiles
    collection="enquiries"
    label="Files sent with the message"
    none="No files were sent with this message."
  />
)
