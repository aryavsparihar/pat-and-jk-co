'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useState } from 'react'

/**
 * Download buttons for pictures in the admin: each work in an application, all of an
 * application's works at once, a member's portrait, and a picture on its own page. The files are
 * private, so each is fetched with the staff member's own sign-in (the same access as viewing it)
 * and saved under a name that says whose and which it is.
 */

type Picture = { url?: string | null; filename?: string | null }

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  const id = (value as { id?: unknown } | null)?.id
  return typeof id === 'number' ? id : null
}

const safe = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

/** Fetches one picture and hands it to the browser as a download */
export const downloadPicture = async (id: number, name: string) => {
  const info = await fetch(`/api/portfolio-images/${id}?depth=0`, { credentials: 'include' })
  if (!info.ok) throw new Error('The picture could not be found.')
  const picture = (await info.json()) as Picture
  if (!picture.url) throw new Error('The picture has no file.')
  const file = await fetch(picture.url, { credentials: 'include' })
  if (!file.ok) throw new Error('The picture could not be downloaded.')
  const blob = await file.blob()
  const extension = (picture.filename?.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg').toLowerCase()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${safe(name)}${extension}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
}

const DownloadButton: React.FC<{ label: string; run: () => Promise<void> }> = ({ label, run }) => {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <button
        className="btn btn--size-small btn--style-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setProblem(null)
          try {
            await run()
          } catch (error) {
            setProblem(error instanceof Error ? error.message : 'It could not be downloaded.')
          } finally {
            setBusy(false)
          }
        }}
        style={{ margin: 0 }}
        type="button"
      >
        {busy ? 'Downloading…' : label}
      </button>
      {problem && (
        <p role="alert" style={{ marginTop: '0.5rem' }}>
          {problem}
        </p>
      )}
    </div>
  )
}

/** The field beside this one, in the same row or group */
const sibling = (path: string, name: string) => path.replace(/[^.]+$/, name)

/** In each work of an application: downloads that work's picture */
export const WorkPictureDownload: React.FC<{ path: string }> = ({ path }) => {
  const image = useFormFields(([fields]) => idOf(fields?.[sibling(path, 'image')]?.value))
  const reference = useFormFields(([fields]) => fields?.reference?.value as string | undefined)
  const title = useFormFields(([fields]) => fields?.[sibling(path, 'title')]?.value as string)
  if (!image) return null
  const row = Number(path.match(/\.(\d+)\.[^.]+$/)?.[1] ?? 0) + 1
  return (
    <DownloadButton
      label="Download this picture"
      run={() =>
        downloadPicture(
          image,
          `${reference ?? 'application'}-work-${row}${title ? `-${title}` : ''}`,
        )
      }
    />
  )
}

/** On an application: every work's picture, one after another */
export const AllPicturesDownload: React.FC = () => {
  const reference = useFormFields(([fields]) => fields?.reference?.value as string | undefined)
  const images = useFormFields(([fields]) =>
    Object.entries(fields ?? {})
      .filter(([key]) => /^portfolio\.\d+\.image$/.test(key))
      .map(([key, field]) => [Number(key.split('.')[1]), idOf(field?.value)] as const)
      .filter((entry): entry is readonly [number, number] => entry[1] !== null)
      .sort((a, b) => a[0] - b[0]),
  )
  if (images.length === 0) return null
  return (
    <DownloadButton
      label={`Download all ${images.length} pictures`}
      run={async () => {
        for (const [row, id] of images)
          await downloadPicture(id, `${reference ?? 'application'}-work-${row + 1}`)
      }}
    />
  )
}

/** Beside a member's portrait */
export const PortraitDownload: React.FC<{ path: string }> = ({ path }) => {
  const image = useFormFields(([fields]) => idOf(fields?.[sibling(path, 'portrait')]?.value))
  const code = useFormFields(
    ([fields]) =>
      (fields?.artistId?.value as string | undefined) ||
      (fields?.partnerId?.value as string | undefined),
  )
  if (!image) return null
  return (
    <DownloadButton
      label="Download the portrait"
      run={() => downloadPicture(image, `${code ?? 'member'}-portrait`)}
    />
  )
}

/** On a picture's own page */
export const ThisPictureDownload: React.FC = () => {
  const { id } = useDocumentInfo()
  const image = idOf(id)
  if (!image) return null
  return (
    <DownloadButton
      label="Download the picture"
      run={() => downloadPicture(image, `picture-${image}`)}
    />
  )
}
