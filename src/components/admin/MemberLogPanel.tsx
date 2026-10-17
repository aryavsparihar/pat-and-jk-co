'use client'

import { useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

type Entry = { id: number; event: string; detail?: string | null; createdAt: string }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * The member's own entries from the security log, newest first, for super admins (the only
 * people who may read the log): every sign-in, code, application step, decision, save in their
 * account, KYC action and deletion, found by their address, their IDs and their application
 * references. The full log is under Administration → Security log.
 */
export const MemberLogPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const email = useFormFields(([fields]) => fields?.email?.value as string | undefined)
  const title = useFormFields(([fields]) => fields?.title?.value as string | undefined)
  const artistId = useFormFields(([fields]) => fields?.artistId?.value as string | undefined)
  const partnerId = useFormFields(([fields]) => fields?.partnerId?.value as string | undefined)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [total, setTotal] = useState(0)

  const superAdmin = ((user as { roles?: string[] } | null)?.roles ?? []).includes('super-admin')

  useEffect(() => {
    if (!superAdmin || !id) return
    let live = true
    const load = async () => {
      const apps = (await fetch(
        `/api/applications?where[member][equals]=${id}&depth=0&limit=50&select[reference]=true`,
        { credentials: 'include' },
      ).then((r) => (r.ok ? r.json() : { docs: [] }))) as { docs: { reference?: string }[] }
      const subjects = [
        artistId,
        partnerId,
        [artistId, partnerId].filter(Boolean).join(' · '),
        ...apps.docs.map((a) => a.reference),
      ].filter((s): s is string => Boolean(s))
      const query = new URLSearchParams({ sort: '-createdAt', limit: '25', depth: '0' })
      let n = 0
      for (const address of [email, title].filter((s): s is string => Boolean(s))) {
        query.set(`where[or][${n++}][email][equals]`, address)
      }
      for (const subject of new Set(subjects)) {
        query.set(`where[or][${n++}][subject][equals]`, subject)
      }
      if (n === 0) return
      const body = (await fetch(`/api/security-events?${query}`, { credentials: 'include' }).then(
        (r) => (r.ok ? r.json() : { docs: [], totalDocs: 0 }),
      )) as { docs: Entry[]; totalDocs: number }
      if (!live) return
      setEntries(body.docs)
      setTotal(body.totalDocs)
    }
    void load().catch(() => live && setEntries([]))
    return () => {
      live = false
    }
  }, [id, superAdmin, email, title, artistId, partnerId])

  if (!superAdmin || !id) return null

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <p className="field-label">Security log</p>
      {entries === null ? (
        <p style={{ margin: 0, opacity: 0.7 }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.7 }}>Nothing recorded for them yet.</p>
      ) : (
        <>
          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              maxHeight: '22rem',
              overflowY: 'auto',
            }}
          >
            {entries.map((e) => (
              <li
                key={e.id}
                style={{
                  padding: '0.4rem 0',
                  borderBottom: '1px solid var(--theme-elevation-100)',
                }}
              >
                <a href={`/admin/collections/security-events/${e.id}`}>{e.event}</a>
                <span style={{ display: 'block', opacity: 0.7, fontSize: '0.85em' }}>
                  {when(e.createdAt)}
                  {e.detail ? ` · ${e.detail}` : ''}
                </span>
              </li>
            ))}
          </ol>
          {total > entries.length && (
            <p style={{ margin: '0.5rem 0 0', opacity: 0.7 }}>
              The latest {entries.length} of {total}. All of them are under Administration →
              Security log.
            </p>
          )}
        </>
      )}
    </div>
  )
}
