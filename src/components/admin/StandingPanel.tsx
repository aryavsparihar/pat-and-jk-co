'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import { useActionDialog, type DialogRequest } from './ActionDialog'

type Choice = 'active' | 'on-hold' | 'suspended'

const SAID: Record<string, string> = {
  active: 'Active: everything works as normal.',
  'on-hold':
    'On hold: they can sign in and see their account, but cannot change anything, and payouts are paused.',
  suspended: 'Suspended: they cannot sign in.',
}

const ASK: Record<Choice, DialogRequest & { done: string; button: string }> = {
  'on-hold': {
    button: 'Put on hold',
    title: 'Put this account on hold?',
    description:
      'They can still sign in and see their account, but cannot change anything (profile, works folder, applications, bank details), and payouts are paused. They are not signed out. Your name and reason go in the security log.',
    confirmLabel: 'Put on hold',
    reason: { label: 'Why?', hint: 'Other staff see this on the record.' },
    done: 'The account is on hold.',
  },
  suspended: {
    button: 'Suspend',
    title: 'Suspend this account?',
    description:
      'They are signed out everywhere at once and cannot sign in until you restore the account. Your name and reason go in the security log.',
    confirmLabel: 'Suspend',
    danger: true,
    reason: { label: 'Why?', hint: 'Other staff see this on the record.' },
    done: 'The account is suspended, and every session has ended.',
  },
  active: {
    button: 'Restore the account',
    title: 'Restore this account?',
    description:
      'Everything works for them again. If they were suspended, they sign in afresh with a code. Your name and reason go in the security log.',
    confirmLabel: 'Restore',
    reason: { label: 'Why?' },
    done: 'The account is active again.',
  },
}

/**
 * The member's standing, and the only way staff change it: suspend, put on hold, or restore, each
 * with a reason (POST /api/members/:id/standing, src/members/standing.ts).
 */
export const StandingPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const router = useRouter()
  const { dialog, ask } = useActionDialog()
  const standing = useFormFields(([fields]) => fields?.standing?.value as string | undefined)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!id || !standing || standing === 'erased') return null

  const change = async (to: Choice) => {
    const { done, ...request } = ASK[to]
    const answer = await ask(request)
    if (!answer) return
    setBusy(true)
    setMessage(null)
    const response = await fetch(`/api/members/${id}/standing`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ standing: to, reason: answer.reason }),
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    setBusy(false)
    if (!response.ok) return setMessage(body.message ?? 'The change could not be saved.')
    setMessage(done)
    router.refresh()
  }

  const choices = (['on-hold', 'suspended', 'active'] as const).filter((c) => c !== standing)

  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <p className="field-label">Account</p>
      <p style={{ marginBottom: '0.5rem' }}>{SAID[standing] ?? standing}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {choices.map((c) => (
          <button
            className={`btn btn--size-small ${c === 'active' ? 'btn--style-primary' : 'btn--style-secondary'}`}
            disabled={busy}
            key={c}
            onClick={() => void change(c)}
            type="button"
          >
            {ASK[c].button}
          </button>
        ))}
      </div>
      {message && (
        <p role="status" style={{ marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
      {dialog}
    </div>
  )
}
