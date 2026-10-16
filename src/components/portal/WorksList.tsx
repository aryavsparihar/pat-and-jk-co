'use client'

import React, { useState } from 'react'

import { api } from '../onboarding/api'
import type { WorkValues } from './WorkForm'

// The pictures are the ones staff added from the artist's Google Drive folder
type Work = WorkValues & { id: number; archived: boolean; isPublic: boolean; images?: number[] }

const REVIEW_WORDS: Record<string, string> = {
  pending: 'Waiting for our review',
  approved: 'Public',
  'changes-requested': 'We asked for a few changes',
  none: 'Not sent',
}

/**
 * The artist's works in their order: where each review stands, and ways to edit, reorder and
 * archive them. Archiving hides a work from the public at once.
 */
export const WorksList: React.FC<{
  initial: Work[]
  thumbnails: Record<number, string | null>
}> = ({ initial, thumbnails }) => {
  const [works, setWorks] = useState<Work[]>(initial)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const move = async (from: number, to: number) => {
    const next = [...works]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    setWorks(next)
    setBusy(true)
    const result = await api<{ artworks: Work[] }>('/next/members/portal/artworks/order', {
      body: { ids: next.map((w) => w.id) },
    })
    setBusy(false)
    if (!result.ok) {
      setWorks(works)
      setMessage(result.data.message ?? 'The order could not be saved.')
    } else setMessage('Order saved.')
  }

  const archive = async (work: Work, archived: boolean) => {
    setBusy(true)
    const result = await api<{ artwork: Work }>(
      `/next/members/portal/artworks/${work.id}/archive`,
      { body: { archived } },
    )
    setBusy(false)
    if (!result.ok) return setMessage(result.data.message ?? 'That could not be done.')
    setWorks((all) => all.map((w) => (w.id === work.id ? { ...w, ...result.data.artwork } : w)))
    setMessage(archived ? `“${work.title}” is archived and hidden.` : `“${work.title}” is back.`)
  }

  if (works.length === 0) {
    return (
      <p className="measure">
        You have not added any works yet.{' '}
        <a className="link" href="/account/works/new">
          Add your first work
        </a>
        .
      </p>
    )
  }

  return (
    <div>
      <p aria-live="polite" className="mb-6 text-base text-primary" role="status">
        {message ?? ''}
      </p>
      <ol className="grid gap-y-0">
        {works.map((work, i) => (
          <li
            className={`grid grid-cols-[5rem_1fr] gap-x-6 gap-y-3 border-t border-border py-6 sm:grid-cols-[6rem_1fr_auto] ${work.archived ? 'opacity-60' : ''}`}
            key={work.id}
          >
            {thumbnails[work.images?.[0] ?? -1] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="aspect-square w-full bg-surface object-cover"
                src={thumbnails[work.images![0]!]!}
              />
            ) : (
              <div className="aspect-square w-full bg-surface" />
            )}
            <div>
              <p className="font-medium">{work.title}</p>
              <p className="muted text-base">
                {[work.year, work.medium].filter(Boolean).join(', ') || '—'}
              </p>
              <p className="mt-2 text-base">
                {work.archived ? 'Archived' : (REVIEW_WORDS[work.review?.state ?? 'none'] ?? '')}
                {work.isPublic &&
                  work.review?.state === 'pending' &&
                  ' (the approved version is public meanwhile)'}
              </p>
            </div>
            <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-1 sm:justify-end">
              <a className="link min-h-11 content-center" href={`/account/works/${work.id}`}>
                Edit<span className="sr-only"> {work.title}</span>
              </a>
              <button
                className="link min-h-11"
                disabled={busy}
                onClick={() => archive(work, !work.archived)}
                type="button"
              >
                {work.archived ? 'Bring back' : 'Archive'}
                <span className="sr-only"> {work.title}</span>
              </button>
              {i > 0 && (
                <button
                  className="link min-h-11"
                  disabled={busy}
                  onClick={() => move(i, i - 1)}
                  type="button"
                >
                  Move up<span className="sr-only"> {work.title}</span>
                </button>
              )}
              {i < works.length - 1 && (
                <button
                  className="link min-h-11"
                  disabled={busy}
                  onClick={() => move(i, i + 1)}
                  type="button"
                >
                  Move down<span className="sr-only"> {work.title}</span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
