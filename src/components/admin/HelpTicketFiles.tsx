'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

/**
 * The files sent with a Help Center request, on the ticket. Pictures show here; each file opens
 * in a new tab, decrypted by the ticket's own route for the signed-in staff member.
 */

type File = { filename: string; contentType: string; size?: number | null }

const size = (bytes?: number | null) =>
  !bytes
    ? ''
    : bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export const HelpTicketFiles: React.FC = () => {
  const { id } = useDocumentInfo()
  const [files, setFiles] = useState<File[] | null>(null)

  useEffect(() => {
    if (!id) return
    void fetch(`/api/help-tickets/${id}?depth=0`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => setFiles((doc?.attachments as File[]) ?? []))
      .catch(() => setFiles([]))
  }, [id])

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base)' }}>
      <label className="field-label">Files sent with the request</label>
      {files === null ? (
        <p>Loading…</p>
      ) : files.length === 0 ? (
        <p>No files were sent with this request.</p>
      ) : (
        <ul
          style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--base)' }}
        >
          {files.map((file, n) => {
            const url = `/api/help-tickets/${id}/files/${n}`
            return (
              <li key={n}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {file.filename}
                </a>{' '}
                <span style={{ opacity: 0.7 }}>
                  {file.contentType === 'application/pdf' ? 'PDF' : 'Picture'}
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
