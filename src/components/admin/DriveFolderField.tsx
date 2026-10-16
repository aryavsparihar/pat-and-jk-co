'use client'

import { TextInput, useField } from '@payloadcms/ui'
import React from 'react'

/**
 * The artist's works folder in the admin: the link, opened in a new tab, and the field itself so
 * staff can correct it. Inside it the artist keeps a folder per work, named exactly as the work
 * (docs/ADMIN_GUIDE.md, "Artists' works").
 */
export const DriveFolderField: React.FC<{ path: string }> = ({ path }) => {
  const { value, setValue } = useField<string>({ path })
  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <p className="field-label">Works folder (Google Drive)</p>
      {value ? (
        <p style={{ marginBottom: '0.5rem' }}>
          <a href={value} rel="noopener noreferrer" target="_blank">
            Open the artist&rsquo;s folder
          </a>
          . Each work is in a folder named after it.
        </p>
      ) : (
        <p style={{ marginBottom: '0.5rem', opacity: 0.8 }}>
          Not given yet. The artist adds it under Your works in their account.
        </p>
      )}
      <TextInput
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
        path={path}
        value={value ?? ''}
      />
    </div>
  )
}
