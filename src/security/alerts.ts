import type { Payload } from 'payload'

import { buildEmail, type EmailPart } from '@/email/layout'
import { getServerSideURL } from '@/utilities/getURL'
import { emailFooter } from '@/email/footer'

import { canSendEmail } from './email'

/**
 * A simple alarm for unusual patterns, with nothing to sign up for: when one kind of trouble
 * passes its threshold within an hour, tech@pjk.co.in (TECHNICAL_INBOX) is emailed, at most once
 * an hour for each kind, and the alert itself is recorded in the security log. Called by
 * logSecurityEvent for every event; it looks at the database at most once a minute per kind and
 * server instance, so a flood costs little.
 */

type Kind = { label: string; events: string[]; threshold: number }

export const ALERTS: Record<string, Kind> = {
  'sign-in-failures': {
    label: 'failed sign-ins',
    events: ['staff-sign-in-failed', 'member-code-failed', 'code-failed'],
    threshold: 20,
  },
  'rate-limits': {
    label: 'rate-limit refusals',
    events: ['rate-limited', 'code-rate-limited', 'member-code-rate-limited'],
    threshold: 30,
  },
  lockouts: { label: 'locked accounts', events: ['staff-locked', 'member-locked'], threshold: 3 },
  'access-refusals': { label: 'refused requests', events: ['access-refused'], threshold: 50 },
  'bot-checks': { label: 'failed bot checks', events: ['bot-check-failed'], threshold: 30 },
}

const kindOf = (event: string) => Object.entries(ALERTS).find(([, k]) => k.events.includes(event))

const lastLooked = new Map<string, number>()

export const watchForAbuse = async (payload: Payload, event: string): Promise<void> => {
  const found = kindOf(event)
  if (!found) return
  const [name, kind] = found
  const now = Date.now()
  if (now - (lastLooked.get(name) ?? 0) < 60_000) return
  lastLooked.set(name, now)

  const hourAgo = new Date(now - 3600_000).toISOString()
  const recent = await payload.count({
    collection: 'security-events',
    where: { and: [{ event: { in: kind.events } }, { createdAt: { greater_than: hourAgo } }] },
    overrideAccess: true,
  })
  if (recent.totalDocs < kind.threshold) return

  const told = await payload.count({
    collection: 'security-events',
    where: {
      and: [
        { event: { equals: 'alert-sent' } },
        { detail: { like: `${name}:` } },
        { createdAt: { greater_than: hourAgo } },
      ],
    },
    overrideAccess: true,
  })
  if (told.totalDocs > 0) return

  const summary = `${recent.totalDocs} ${kind.label} in the last hour (alert threshold ${kind.threshold})`
  await payload.create({
    collection: 'security-events',
    data: { event: 'alert-sent', detail: `${name}: ${summary}` },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await sendAlert(payload, summary)
}

/**
 * Emails the technical inbox, tech@ (and anyone copied); never throws. Shared with
 * src/observability/errorAlerts.ts. Only site errors and security alerts come here: never member,
 * KYC or data-protection details.
 */
export const sendTechnicalAlert = async (
  payload: Payload,
  {
    subject,
    preheader,
    parts,
    cc,
  }: { subject: string; preheader: string; parts: EmailPart[]; cc?: string[] },
) => {
  if (!canSendEmail(payload)) {
    payload.logger.warn({ msg: `[alert] ${subject}` })
    return
  }
  const { deliver, TECH_INBOX } = await import('@/email/send')
  await deliver(
    payload,
    { to: TECH_INBOX, cc },
    buildEmail({
      subject,
      preheader,
      parts,
      footer: await emailFooter(payload),
      recipient: { inbox: TECH_INBOX },
    }),
  )
}

/** 37. A burst of failures: to tech@, with business@ copied */
const sendAlert = async (payload: Payload, summary: string) => {
  const { BUSINESS_INBOX } = await import('@/email/send')
  return sendTechnicalAlert(payload, {
    subject: `PJK security alert: ${summary}`,
    preheader: `The website recorded ${summary}.`,
    cc: [BUSINESS_INBOX],
    parts: [
      { kind: 'paragraph', text: `The website has recorded ${summary}.` },
      {
        kind: 'paragraph',
        text: 'This may indicate an automated script or repeated unauthorised sign-in attempts. Please inspect Admin → Administration → Security log to review the originating IP addresses and accounts, and follow docs/RUNBOOK.md if mitigation is required.',
      },
      {
        kind: 'paragraph',
        text: 'Further alerts for this specific threshold are suppressed for the next 60 minutes.',
      },
      {
        kind: 'link',
        label: 'Open security log',
        url: `${getServerSideURL()}/admin/collections/security-events`,
      },
    ],
  })
}
