import type { UIFieldServerProps } from 'payload'
import Link from 'next/link'
import React from 'react'

import type { Application } from '@/payload-types'

const STAGE: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  'under-review': 'Under review',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : null

/**
 * Every application this person has made of this kind, newest first, with this one marked: what
 * became of each, when, and the note they were sent. Staff only (the admin is staff only).
 */
export const ApplicationHistory: React.FC<UIFieldServerProps> = async ({ data, payload }) => {
  const memberId = typeof data?.member === 'object' ? data?.member?.id : data?.member
  if (!memberId || !data?.type) return null
  const all = await payload.find({
    collection: 'applications',
    where: { and: [{ member: { equals: memberId } }, { type: { equals: data.type } }] },
    sort: '-createdAt',
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  if (all.docs.length < 2) return null
  return (
    <div style={{ marginBottom: 'calc(var(--base) * 1.5)' }}>
      <p className="field-label">History: every {data.type} application from this person</p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {all.docs.map((app: Application) => {
          const when = day(app.withdrawnAt ?? app.decidedAt ?? app.submittedAt ?? app.createdAt)
          const isThis = app.id === data.id
          return (
            <li
              key={app.id}
              style={{
                borderTop: '1px solid var(--theme-elevation-100)',
                padding: 'calc(var(--base) * 0.5) 0',
              }}
            >
              <strong>
                {isThis ? (
                  app.reference
                ) : (
                  <Link href={`/admin/collections/applications/${app.id}`}>{app.reference}</Link>
                )}
              </strong>
              {isThis ? ' (this one)' : ''} · {STAGE[app.stage] ?? app.stage}
              {when ? `, ${when}` : ''}
              {app.decisionNote && (
                <span style={{ display: 'block', whiteSpace: 'pre-line', opacity: 0.8 }}>
                  {app.decisionNote}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
