import type { AdminViewServerProps, Where } from 'payload'
import React from 'react'

import { isStaff } from '@/access/roles'
import {
  CURATOR_AREAS,
  CURATOR_STATUSES,
  CURATOR_WANTS,
  CURATOR_YEARS,
  labelOf,
} from '@/curators/rules'
import type { Application } from '@/payload-types'

import { CuratorActions, CuratorNotes } from './CuratorActions'

/**
 * The Curators screen (the founder's AdminCurators design), at /admin/curators: every guest
 * curator's application, with counts by status, a search and filters, and the one selected in
 * full, with its files, consent, the buttons that open each letter for editing, and team notes.
 */

const PILL: Record<string, React.CSSProperties> = {
  new: { background: '#f5ecd6', color: '#6b4e0e' },
  talking: { background: '#e7eef6', color: '#1d3d63' },
  working: { background: '#e3ede6', color: '#1f4a33' },
  'on-file': { background: '#ece7dc', color: '#4a4f4b' },
  'not-this-time': { background: '#f1e4e2', color: '#6b2a22' },
}

const WANTS_SHORT: Record<string, string> = {
  phulhaar: 'Phulhaar',
  clients: 'Clients',
  both: 'Both',
}

const date = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    : '—'

const dateTime = (iso?: string | null) =>
  iso
    ? `${new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })} IST`
    : '—'

const Pill: React.FC<{ status?: string | null }> = ({ status }) => (
  <span
    style={{
      ...(PILL[status ?? ''] ?? {}),
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 13,
      whiteSpace: 'nowrap',
    }}
  >
    {labelOf(CURATOR_STATUSES, status) || '—'}
  </span>
)

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export const CuratorsView: React.FC<AdminViewServerProps> = async ({
  initPageResult,
  searchParams,
}) => {
  const { req } = initPageResult
  if (!isStaff(req.user)) {
    return (
      <div className="gutter--left gutter--right" style={{ padding: '2rem 0' }}>
        <p>Only staff can see guest curators.</p>
      </div>
    )
  }
  const params = (searchParams ?? {}) as Record<string, string | string[] | undefined>
  const q = (one(params.q) ?? '').trim()
  const status = one(params.status) ?? ''
  const focus = one(params.focus) ?? ''
  const project = one(params.project) ?? ''
  const selectedId = Number(one(params.selected))

  const where: Where[] = [{ type: { equals: 'curator' } }, { stage: { not_equals: 'draft' } }]
  if (q)
    where.push({
      or: [
        { 'curator.fullName': { like: q } },
        { reference: { like: q.toUpperCase() } },
        { 'curator.email': { like: q.toLowerCase() } },
      ],
    })
  if (CURATOR_STATUSES.some((s) => s.value === status))
    where.push({ curatorStatus: { equals: status } })
  if (CURATOR_AREAS.some((a) => a.value === focus)) where.push({ 'curator.areas': { in: [focus] } })
  if (project === 'none') where.push({ curatorProject: { exists: false } })
  else if (project) where.push({ curatorProject: { equals: project } })

  const { payload } = req
  const [found, all] = await Promise.all([
    payload.find({
      collection: 'applications',
      where: { and: where },
      sort: '-submittedAt',
      depth: 0,
      limit: 200,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'applications',
      where: { and: [{ type: { equals: 'curator' } }, { stage: { not_equals: 'draft' } }] },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
      select: { curatorStatus: true, curatorProject: true },
    }),
  ])
  const count = (s: string) => all.docs.filter((d) => d.curatorStatus === s).length
  const projects = [...new Set(all.docs.map((d) => d.curatorProject).filter(Boolean))] as string[]

  const rows = found.docs
  const selected: Application | undefined =
    rows.find((r) => r.id === selectedId) ??
    (Number.isSafeInteger(selectedId) && selectedId > 0
      ? await payload
          .findByID({ collection: 'applications', id: selectedId, depth: 0, overrideAccess: true })
          .then((a) => (a.type === 'curator' && a.stage !== 'draft' ? a : undefined))
          .catch(() => undefined)
      : undefined)

  const link = (id: number) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ q, status, focus, project })) if (v) next.set(k, v)
    next.set('selected', String(id))
    return `/admin/curators?${next.toString()}`
  }

  const label: React.CSSProperties = {
    fontSize: 12,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.7,
  }

  return (
    <div className="gutter--left gutter--right" style={{ padding: '2rem 0 4rem', maxWidth: 1200 }}>
      <h1>Guest curators</h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', margin: '1.25rem 0 1.75rem' }}>
        {(['new', 'talking', 'working', 'on-file'] as const).map((s) => (
          <div key={s}>
            <div style={label}>{labelOf(CURATOR_STATUSES, s)}</div>
            <div style={{ fontSize: 28 }}>{count(s)}</div>
            {s === 'on-file' && (
              <div style={{ fontSize: 13, opacity: 0.7 }}>Kept with their permission</div>
            )}
          </div>
        ))}
      </div>

      <form
        method="get"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}
      >
        <label style={{ display: 'grid', gap: 4, flex: '1 1 240px' }}>
          <span style={label}>Search by name or number</span>
          <input
            className="field-type text"
            defaultValue={q}
            name="q"
            placeholder="Search by name or CA number"
            style={{ padding: '8px 10px' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={label}>Status</span>
          <select defaultValue={status} name="status" style={{ padding: '8px 10px' }}>
            <option value="">All statuses</option>
            {CURATOR_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={label}>Focus</span>
          <select defaultValue={focus} name="focus" style={{ padding: '8px 10px' }}>
            <option value="">Any focus</option>
            {CURATOR_AREAS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.value === 'events-sets' ? 'Events and sets' : a.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={label}>Project</span>
          <select defaultValue={project} name="project" style={{ padding: '8px 10px' }}>
            <option value="">Any project</option>
            <option value="none">Not on a project</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--style-secondary btn--size-small" type="submit">
          Show
        </button>
      </form>

      <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {[
                'Name',
                'Number',
                'Based in',
                'Focus',
                'Wants',
                'Portfolio',
                'Status',
                'Project',
                'Received',
              ].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', ...label }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '14px 10px', opacity: 0.7 }}>
                  No guest curators match.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const c = r.curator ?? {}
              const hasPdf = (r.curatorFiles ?? []).some((f) => f.kind === 'portfolio')
              const portfolio = hasPdf
                ? `/api/applications/${r.id}/curator-file/portfolio`
                : c.portfolioLink
              return (
                <tr
                  key={r.id}
                  style={{
                    borderTop: '1px solid var(--theme-elevation-100)',
                    background: r.id === selected?.id ? 'var(--theme-elevation-50)' : undefined,
                  }}
                >
                  <td style={{ padding: '10px' }}>
                    <a href={link(r.id)}>{c.fullName || '—'}</a>
                  </td>
                  <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{r.reference}</td>
                  <td style={{ padding: '10px' }}>
                    {[c.city, c.country].filter(Boolean).join(', ')}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {(c.areas ?? []).map((a) => labelOf(CURATOR_AREAS, a)).join('; ')}
                  </td>
                  <td style={{ padding: '10px' }}>{WANTS_SHORT[c.wants ?? ''] ?? '—'}</td>
                  <td style={{ padding: '10px' }}>
                    {portfolio ? (
                      <a href={portfolio} rel="noopener noreferrer" target="_blank">
                        Open
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <Pill status={r.curatorStatus} />
                  </td>
                  <td style={{ padding: '10px' }}>{r.curatorProject || '—'}</td>
                  <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>{date(r.submittedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && <Selected application={selected} label={label} />}
    </div>
  )
}

const Selected: React.FC<{ application: Application; label: React.CSSProperties }> = ({
  application: a,
  label,
}) => {
  const c = a.curator ?? {}
  const d = a.curatorDeclarations ?? {}
  const files = a.curatorFiles ?? []
  const consent = (a.consentRecord ?? [])[0]
  const row = (term: string, value: React.ReactNode) => (
    <>
      <dt style={{ ...label, paddingTop: 12 }}>{term}</dt>
      <dd style={{ margin: '4px 0 0', lineHeight: 1.6 }}>{value || '—'}</dd>
    </>
  )
  return (
    <>
      <section
        style={{
          marginTop: '2.5rem',
          padding: '1.75rem',
          border: '1px solid var(--theme-elevation-150)',
        }}
      >
        <p style={label}>Selected · {a.reference}</p>
        <h2 style={{ margin: '0.25rem 0 0.75rem' }}>{c.fullName}</h2>
        <dl style={{ margin: 0 }}>
          {row('Contact', [c.email, c.phone].filter(Boolean).join(' · '))}
          {row('Based in', [c.city, c.country].filter(Boolean).join(', '))}
          {row('Role', [c.role, labelOf(CURATOR_YEARS, c.years)].filter(Boolean).join(' · '))}
          {row('Curates', (c.areas ?? []).map((x) => labelOf(CURATOR_AREAS, x)).join('; '))}
          {row('Languages', c.languages)}
          {row('Wants', labelOf(CURATOR_WANTS, c.wants))}
          {row(
            'A collection idea',
            c.idea && <span style={{ whiteSpace: 'pre-line' }}>{c.idea}</span>,
          )}
          {row('Usual fee', c.fee)}
          {row('Could start', c.start)}
          {row(
            'Files',
            <>
              {c.portfolioLink && (
                <>
                  <a href={c.portfolioLink} rel="noopener noreferrer" target="_blank">
                    Portfolio link
                  </a>
                  {' · '}
                </>
              )}
              {files.map((f) => (
                <React.Fragment key={f.kind}>
                  <a
                    href={`/api/applications/${a.id}/curator-file/${f.kind}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {f.kind === 'portfolio' ? 'Portfolio PDF' : 'CV'}
                  </a>
                  {' · '}
                </React.Fragment>
              ))}
              {(c.projects ?? []).length} past projects
            </>,
          )}
          {row(
            'Past projects',
            <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {(c.projects ?? []).map((p, i) => (
                <li key={p.id ?? i}>
                  {p.link ? (
                    <a href={p.link} rel="noopener noreferrer" target="_blank">
                      {p.title}
                    </a>
                  ) : (
                    p.title
                  )}{' '}
                  ({p.year}), {p.place}. Their part: {p.role}.
                </li>
              ))}
            </ol>,
          )}
          {row(
            'Consent',
            `Privacy notice v${d.privacyNoticeVersion ?? '—'}, ${dateTime(consent?.submittedAt ?? a.submittedAt)} · 18 or over: ${d.adult ? 'yes' : 'no'} · on file for 12 months: ${d.keepOnFile ? 'yes' : 'no'}`,
          )}
          {row('Status', <Pill status={a.curatorStatus} />)}
          {row('Project', a.curatorProject)}
        </dl>

        <CuratorActions
          application={{
            id: a.id,
            reference: a.reference,
            fullName: c.fullName ?? '',
            keepOnFile: Boolean(d.keepOnFile),
            project: a.curatorProject ?? '',
          }}
        />

        {(a.curatorEmails ?? []).length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <p style={label}>Emails sent</p>
            <ul style={{ paddingLeft: '1.25rem' }}>
              {(a.curatorEmails ?? []).map((e, i) => (
                <li key={e.id ?? i}>
                  {e.kind === 'talk' ? '“We would like to talk”' : '“Not this time”'}, by {e.by},{' '}
                  {dateTime(e.at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Team notes</h2>
        {(a.teamNotes ?? []).length === 0 ? (
          <p style={{ opacity: 0.7 }}>No notes yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {(a.teamNotes ?? []).map((n, i) => (
              <li
                key={n.id ?? i}
                style={{ padding: '10px 0', borderTop: '1px solid var(--theme-elevation-100)' }}
              >
                <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{n.note}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.7 }}>
                  {n.by}, {dateTime(n.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <CuratorNotes id={a.id} />
        <p style={{ marginTop: '1.25rem', fontSize: 14, opacity: 0.75 }}>
          Applications not kept on file are deleted 90 days after “Not this time” is sent.
        </p>
      </section>
    </>
  )
}

export default CuratorsView
