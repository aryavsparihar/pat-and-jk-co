import type { Payload } from 'payload'

import { emailFooter } from '@/email/footer'
import { buildEmail } from '@/email/layout'
import { getServerSideURL } from '@/utilities/getURL'

import { type Inbox, topicTitle } from './topics'

/**
 * The one email a contact message sends: to the inbox its subject belongs to, with the sender as
 * reply-to so it can be answered with Reply. There is no copy to the sender (the brief, section
 * 12: no confirmation emails for any form); the page tells them it arrived. Files are not
 * attached, since three of 10 MB would be too large for many inboxes: the email links to the
 * message in the admin, where staff open them.
 */

export type ContactMessage = {
  id: number
  name: string
  email: string
  topic: string
  message: string
  files: { filename: string; size: number }[]
}

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export const inboxAddress = async (inbox: Inbox): Promise<string> => {
  const { BUSINESS_INBOX, COMPLIANCE_INBOX, TECH_INBOX } = await import('@/email/send')
  return inbox === 'tech' ? TECH_INBOX : inbox === 'compliance' ? COMPLIANCE_INBOX : BUSINESS_INBOX
}

export const sendContactMessage = async (
  payload: Payload,
  inbox: Inbox,
  message: ContactMessage,
): Promise<boolean> => {
  const { deliver } = await import('@/email/send')
  const to = await inboxAddress(inbox)
  const title = topicTitle(message.topic)
  return deliver(
    payload,
    { to, replyTo: message.email },
    buildEmail({
      subject: `Contact form: ${title}`,
      preheader: `A message from ${message.name}.`,
      parts: [
        {
          kind: 'paragraph',
          text: `${message.name} has written through the contact page. Reply to this email to answer them directly.`,
        },
        {
          kind: 'fields',
          rows: [
            { label: 'Writing about', value: title },
            { label: 'Name', value: message.name },
            { label: 'Email address', value: message.email },
            {
              label: 'Files',
              value: message.files.length
                ? message.files.map((f) => `${f.filename} (${size(f.size)})`).join('\n')
                : 'None',
            },
          ],
        },
        { kind: 'paragraph', text: 'Their message:' },
        { kind: 'paragraph', text: message.message },
        ...(message.files.length
          ? [
              {
                kind: 'link' as const,
                label: 'Open the message and its files',
                url: `${getServerSideURL()}/admin/collections/enquiries/${message.id}`,
              },
            ]
          : []),
      ],
      footer: await emailFooter(payload),
      recipient: { inbox: to },
    }),
  )
}
