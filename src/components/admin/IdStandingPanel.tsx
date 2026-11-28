'use client'

import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { useActionDialog, type DialogRequest } from './ActionDialog'

type Role = 'artist' | 'partner'
type Choice = 'active' | 'suspended' | 'removed'

const NAMES: Record<Role, { id: string; account: string; idField: string; group: string }> = {
  artist: {
    id: 'Artist ID',
    account: 'artist account',
    idField: 'artistId',
    group: 'artistAccess',
  },
  partner: {
    id: 'Trade Partner ID',
    account: 'Trade Program account',
    idField: 'partnerId',
    group: 'partnerAccess',
  },
}

type Member = Record<string, unknown> & {
  artistAccess?: { standing?: string; reason?: string; changedAt?: string } | null
  partnerAccess?: { standing?: string; reason?: string; changedAt?: string } | null
}

/**
 * One ID's standing on a member, and the only way staff change it: suspend, restore, or remove
 * that ID alone, each with a reason (POST /api/members/:id/id-standing, src/members/idStanding.ts).
 * Shown beneath the IDs, once for each ID the member holds.
 */
export const IdStandingPanel: React.FC<{ role: Role }> = ({ role }) => {
  const { id } = useDocumentInfo()
  const { user } = useAuth()
  const router = useRouter()
  const { dialog, ask } = useActionDialog()
  const [member, setMember] = useState<Member | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const names = NAMES[role]

  const load = React.useCallback(() => {
    if (!id) return
    void fetch(`/api/members/${id}?depth=0`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => setMember(doc))
      .catch(() => undefined)
  }, [id])
  useEffect(load, [load])

  const memberId = member?.[names.idField] as string | undefined
  if (!id || !member || !memberId || member.standing === 'erased') return null
  const access = member[names.group as 'artistAccess' | 'partnerAccess']
  const standing = access?.standing ?? 'active'
  const superAdmin = Boolean((user as { roles?: string[] } | null)?.roles?.includes('super-admin'))

  const ASK: Record<Choice, DialogRequest & { done: string; button: string }> = {
    suspended: {
      button: `Suspend ${names.id}`,
      title: `Suspend ${memberId}?`,
      description: `Their ${names.account} closes until you restore it. Their other ID, if they have one, is not affected. If no ID is left open they are signed out everywhere. Your name and reason go in the security log.`,
      confirmLabel: 'Suspend',
      danger: true,
      reason: { label: 'Why?', hint: 'Other staff see this on the record.' },
      done: `${memberId} is suspended.`,
    },
    active: {
      button: `Restore ${names.id}`,
      title: `Restore ${memberId}?`,
      description: `Their ${names.account} works again. Your name and reason go in the security log.`,
      confirmLabel: 'Restore',
      reason: { label: 'Why?' },
      done: `${memberId} is active again.`,
    },
    removed: {
      button: `Remove ${names.id}`,
      title: `Remove ${memberId} for good?`,
      description: `The ID is retired and can never be restored or issued again, and their ${names.account} closes.${role === 'artist' ? ' Their public profile is taken down.' : ''} The records of their approval and any payments are kept, as the law requires. Their other ID, if they have one, is not affected. To delete the person and all their details, use "Delete this person" instead.`,
      confirmLabel: 'Remove for good',
      danger: true,
      typed: { label: `Type ${memberId} to confirm`, expect: memberId },
      reason: { label: 'Why?' },
      done: `${memberId} has been removed.`,
    },
  }

  const change = async (to: Choice) => {
    const { done, ...request } = ASK[to]
    const answer = await ask(request)
    if (!answer) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/members/${id}/id-standing`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, standing: to, reason: answer.reason }),
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok)
      return setMessage(body.message ?? 'The change could not be saved. Please try again.')
    setMessage(done)
    load()
    router.refresh()
  }

  const SAID: Record<string, string> = {
    active: 'Active.',
    suspended: 'Suspended: this account is closed until restored.',
    removed: 'Removed for good.',
  }
  const choices: Choice[] =
    standing === 'removed'
      ? []
      : ([
          standing === 'active' ? 'suspended' : 'active',
          ...(superAdmin ? ['removed'] : []),
        ] as Choice[])

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <p className="field-label">
        {names.id} {memberId}
      </p>
      <p style={{ marginBottom: '0.5rem' }}>
        {SAID[standing] ?? standing}
        {access?.reason && standing !== 'active' ? ` Why: ${access.reason}` : ''}
        {access?.changedAt && standing !== 'active'
          ? ` (since ${new Date(access.changedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })})`
          : ''}
      </p>
      {choices.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {choices.map((c) => (
            <button
              className={`btn btn--size-small ${c === 'removed' ? 'pjk-btn-danger' : c === 'active' ? 'btn--style-primary' : 'btn--style-secondary'}`}
              disabled={busy}
              key={c}
              onClick={() => void change(c)}
              type="button"
            >
              {ASK[c].button}
            </button>
          ))}
        </div>
      )}
      {message && (
        <p role="status" style={{ marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
      {dialog}
    </div>
  )
}
