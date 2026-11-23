'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React, { useEffect } from 'react'

/**
 * Active Tickets and Resolved Tickets, above the Help Center ticket list. Each is the list filtered
 * by status; the list opens on Active. Moving a ticket between them is its status, set on the
 * ticket (or on several at once with Edit).
 */

const TABS = [
  { status: 'active', label: 'Active Tickets' },
  { status: 'resolved', label: 'Resolved Tickets' },
] as const

const PARAM = 'where[status][equals]'

export const HelpTicketTabs: React.FC = () => {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const current = params.get(PARAM)

  // Opened with no filter at all: show the active tickets
  useEffect(() => {
    if (![...params.keys()].some((key) => key.startsWith('where'))) {
      const next = new URLSearchParams(params)
      next.set(PARAM, 'active')
      router.replace(`${pathname}?${next.toString()}`)
    }
  }, [params, pathname, router])

  const href = (status: string) => {
    const next = new URLSearchParams()
    for (const [key, value] of params)
      if (!key.startsWith('where') && key !== 'page') next.set(key, value)
    next.set(PARAM, status)
    return `${pathname}?${next.toString()}`
  }

  return (
    <nav
      aria-label="Tickets"
      style={{ display: 'flex', gap: 'calc(var(--base) / 2)', marginBottom: 'var(--base)' }}
    >
      {TABS.map((tab) => (
        <Link
          key={tab.status}
          href={href(tab.status)}
          aria-current={current === tab.status ? 'page' : undefined}
          className={`btn btn--size-small ${current === tab.status ? 'btn--style-primary' : 'btn--style-secondary'}`}
          style={{ margin: 0 }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
