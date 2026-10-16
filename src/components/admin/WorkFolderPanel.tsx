import type { UIFieldServerProps } from 'payload'
import React from 'react'

/**
 * Where this work's pictures and video are: the folder named after it, inside its artist's Google
 * Drive folder, with the file names to expect. Staff download the pictures from there to add them
 * here when they approve the work.
 */
export const WorkFolderPanel: React.FC<UIFieldServerProps> = async ({ data, payload }) => {
  const ownerId = typeof data?.owner === 'object' ? data?.owner?.id : data?.owner
  if (!ownerId) return null
  const owner = await payload
    .findByID({ collection: 'members', id: ownerId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const folder = (owner as { worksFolder?: string | null } | null)?.worksFolder
  const name = String(data?.title ?? '').trim() || 'the work’s name'
  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      <p className="field-label">Pictures and video</p>
      {folder ? (
        <p style={{ marginBottom: '0.5rem' }}>
          In the folder <strong>{name}</strong>, inside{' '}
          <a href={folder} rel="noopener noreferrer" target="_blank">
            the artist&rsquo;s Google Drive folder
          </a>
          .
        </p>
      ) : (
        <p style={{ marginBottom: '0.5rem' }}>
          The artist has not given their Google Drive folder yet.
        </p>
      )}
      <p style={{ opacity: 0.8 }}>
        Expect &ldquo;{name} - 1.jpg&rdquo;, &ldquo;{name} - 2.jpg&rdquo; and so on, the front
        first, and &ldquo;{name} - video.mp4&rdquo; if there is a video.
      </p>
    </div>
  )
}
