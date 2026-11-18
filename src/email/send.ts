import type { Payload } from 'payload'

import { canSendEmail } from '@/security/email'

import type { BuiltEmail } from './layout'

/**
 * Where every automated email goes, as the founder set out on 13 November 2026.
 *
 * - business@: every operational alert (applications, profiles, works folders, agreements,
 *   payouts, data requests, contact changes) and a blind copy of every decision or account notice
 *   sent to a person, so there is a complete, timed record.
 * - compliance@: executed agreements, and a copy of agreements signed online, bank changes stopped
 *   by the member, data-protection requests and account deletions.
 * - tech@: only site errors, security alerts and admin lockouts. Never member, KYC or DPDP data.
 *
 * Each can be pointed elsewhere by its environment variable (for a staging site, say).
 */
export const BUSINESS_INBOX = process.env.BUSINESS_INBOX || 'business@pjk.co.in'
export const COMPLIANCE_INBOX = process.env.COMPLIANCE_INBOX || 'compliance@pjk.co.in'
export const TECH_INBOX = process.env.TECHNICAL_INBOX || 'tech@pjk.co.in'

export type Envelope = {
  to: string | string[]
  cc?: string[]
  bcc?: string[]
  /** Where a reply goes, when not the sender (a Help Center request: the person who raised it) */
  replyTo?: string
  attachments?: { filename: string; content: Buffer; contentType: string }[]
}

const list = (a?: string | string[]) => (Array.isArray(a) ? a : a ? [a] : [])

/**
 * Sends one email to its envelope. In development without an email service, it prints that one
 * was "sent" (with who it went to) instead. Never throws: false when it could not be sent.
 */
export const deliver = async (
  payload: Payload,
  envelope: Envelope,
  email: BuiltEmail,
): Promise<boolean> => {
  const to = list(envelope.to)
  // Never the same address twice, and never a copy to someone it is already addressed to
  const cc = [...new Set(envelope.cc ?? [])].filter((a) => !to.includes(a))
  const bcc = [...new Set(envelope.bcc ?? [])].filter((a) => !to.includes(a) && !cc.includes(a))
  if (to.length === 0) return false
  if (!canSendEmail(payload)) {
    if (process.env.NODE_ENV === 'production') {
      payload.logger.error(`No email service configured; "${email.subject}" was not sent`)
      return false
    }
    const copies = [
      cc.length ? ` cc ${cc.join(', ')}` : '',
      bcc.length ? ` bcc ${bcc.join(', ')}` : '',
      envelope.replyTo ? ` reply-to ${envelope.replyTo}` : '',
      envelope.attachments?.length
        ? ` with ${envelope.attachments.map((a) => a.filename).join(', ')}`
        : '',
    ]
    payload.logger.info(
      `[dev] Email "${email.subject}" to ${to.join(', ')}${copies.join('')}:\n${email.text}`,
    )
    return true
  }
  try {
    await payload.sendEmail({
      to,
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      ...(envelope.replyTo ? { replyTo: envelope.replyTo } : {}),
      subject: email.subject,
      text: email.text,
      html: email.html,
      ...(envelope.attachments ? { attachments: envelope.attachments } : {}),
    })
    return true
  } catch (error) {
    payload.logger.error({ err: error, msg: `Could not send "${email.subject}"` })
    return false
  }
}
