import type { Payload } from 'payload'

import { emailFooter } from '@/email/footer'
import { BRAND, buildEmail, type EmailPart, GREEN } from '@/email/layout'

import { detailsHtml, detailsText, type HelpRequest, NATURES, REQUEST_TYPES } from './request'

/**
 * The two emails a Help Center request sends, both in the master template:
 *
 * - to PJK: a Business Inquiry to business@; a Technical Issue / Inquiry to tech@ with a blind
 *   copy to business@ (the founder, 13 November 2026). Every field, the details and the files,
 *   with the sender as reply-to so it can be answered with Reply
 * - to the sender: received and logged under the ticket number, with a copy of what they sent.
 *   The files are named, not attached again
 */

const rows = (request: HelpRequest) => [
  { label: 'Request type', value: REQUEST_TYPES[request.requestType].label },
  { label: 'Nature of request', value: NATURES[request.nature] },
  { label: 'Email address', value: request.email },
  { label: REQUEST_TYPES[request.requestType].idLabel, value: request.memberCode },
  { label: 'Full name', value: request.name },
  { label: 'Device', value: request.device || 'Not given' },
  { label: 'Browser', value: request.browser || 'Not given' },
  { label: 'Cleared cache and cookies', value: request.clearedCache ? 'Yes' : 'No' },
  { label: 'Subject', value: request.subject || 'Not given' },
  {
    label: 'Attachments',
    value: request.attachments.length
      ? request.attachments.map((a) => a.filename).join('\n')
      : 'None',
  },
]

const details = (request: HelpRequest): EmailPart[] => [
  { kind: 'paragraph', text: 'Details of the request:' },
  { kind: 'html', html: detailsHtml(request.details, GREEN), text: detailsText(request.details) },
]

const title = (ticket: string, request: HelpRequest) =>
  `${request.subject || NATURES[request.nature]} [Ticket ${ticket}]`

export const routeFor = async (nature: HelpRequest['nature']) => {
  const { BUSINESS_INBOX, TECH_INBOX } = await import('@/email/send')
  return nature === 'business'
    ? { to: BUSINESS_INBOX, bcc: [] as string[] }
    : { to: TECH_INBOX, bcc: [BUSINESS_INBOX] }
}

/** To PJK's inbox: everything the sender gave, with their files attached */
export const sendHelpRequest = async (
  payload: Payload,
  ticket: string,
  request: HelpRequest,
): Promise<boolean> => {
  const { deliver } = await import('@/email/send')
  const route = await routeFor(request.nature)
  return deliver(
    payload,
    {
      to: route.to,
      bcc: route.bcc,
      replyTo: request.email,
      attachments: request.attachments,
    },
    buildEmail({
      subject: `Help Center: ${title(ticket, request)}`,
      preheader: `${NATURES[request.nature]} from ${request.name} (${request.memberCode}).`,
      parts: [
        {
          kind: 'paragraph',
          text: `A new request has been raised through the ${BRAND} Help Center. Reply to this email to answer ${request.name} directly, quoting the ticket number.`,
        },
        { kind: 'reference', label: 'Ticket number', value: ticket },
        { kind: 'fields', rows: rows(request) },
        ...details(request),
      ],
      footer: await emailFooter(payload),
      recipient: { inbox: route.to },
    }),
  )
}

/** To the sender: received and logged, with a copy of what they sent */
export const sendHelpAcknowledgement = async (
  payload: Payload,
  ticket: string,
  request: HelpRequest,
): Promise<boolean> => {
  const { deliver } = await import('@/email/send')
  const route = await routeFor(request.nature)
  return deliver(
    payload,
    { to: request.email },
    buildEmail({
      subject: `We have received your request [Ticket ${ticket}]`,
      preheader: `Your request has been logged under ticket ${ticket}.`,
      parts: [
        { kind: 'paragraph', text: `Dear ${request.name},` },
        {
          kind: 'paragraph',
          text: `Thank you for contacting the ${BRAND} Help Center. Your request has been received and logged under the ticket number below. Please quote it in any correspondence about this request.`,
        },
        { kind: 'reference', label: 'Ticket number', value: ticket },
        {
          kind: 'paragraph',
          text: `Our team will review your request and reply to ${request.email}. If you need to add anything, write to ${route.to} with your ticket number in the subject.`,
        },
        { kind: 'paragraph', text: 'A copy of your request is below for your records.' },
        { kind: 'fields', rows: rows(request) },
        ...details(request),
      ],
      footer: await emailFooter(payload),
      recipient: { email: request.email, name: request.name },
    }),
  )
}
