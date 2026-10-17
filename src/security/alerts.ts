import type { Payload } from 'payload'

import { buildEmail } from '@/email/layout'
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

/** Emails the technical inbox; never throws. Shared with src/observability/errorAlerts.ts */
export const sendTechnicalAlert = async (
  payload: Payload,
  { subject, lines, note }: { subject: string; lines: string[]; note?: string },
) => {
  const to = process.env.TECHNICAL_INBOX || 'tech@pjk.co.in'
  if (!canSendEmail(payload)) {
    payload.logger.warn({ msg: `[alert] ${subject}` })
    return
  }
  const built = buildEmail({
    subject,
    preheader: lines[0]?.slice(0, 120) ?? subject,
    parts: [
      ...lines.map((text) => ({ kind: 'paragraph' as const, text })),
      ...(note ? [{ kind: 'note' as const, text: note }] : []),
    ],
    footer: await emailFooter(payload),
  })
  try {
    await payload.sendEmail({ to, subject, text: built.text, html: built.html })
  } catch (error) {
    payload.logger.warn({ err: error, msg: 'Could not send a technical alert' })
  }
}

const sendAlert = (payload: Payload, summary: string) =>
  sendTechnicalAlert(payload, {
    subject: `PJK security alert: ${summary}`,
    lines: [
      `The site has recorded ${summary}.`,
      'This may be someone trying passwords or codes, or a script hammering the site. Look at Admin → Administration → Security log for who and where, and at docs/RUNBOOK.md if you need to act.',
    ],
    note: 'You will not hear about this kind of trouble again for an hour, however much more there is.',
  })
