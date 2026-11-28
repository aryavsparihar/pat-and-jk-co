import type { Payload } from 'payload'

import { emailFooter } from '@/email/footer'
import { buildEmail, type EmailPart } from '@/email/layout'
import { getServerSideURL } from '@/utilities/getURL'

import { CURATOR_AREAS, CURATOR_WANTS, CURATOR_YEARS, labelOf } from './rules'

/**
 * The emails about a guest curator's application (the founder's CuratorEmails design).
 *
 * - To business@, when an application arrives: everything on it, with a link to the Curators
 *   screen. There is no copy to the curator: the brief (section 12) does away with confirmation
 *   emails for every form, and the page tells them it has arrived.
 * - From the team, opened for editing on the Curators screen before it goes: "We would like to
 *   talk", and "Not this time", whose second paragraph depends on whether they asked to be kept
 *   on file. Each goes from noreply@ with a blind copy to business@, as every decision does.
 */

export { curatorEmailDraft, type CuratorEmailKind } from './drafts'

type Curator = {
  id: number
  reference: string
  fullName: string
  email: string
  keepOnFile: boolean
}

const SIGN_OFF = [
  'With best wishes,',
  'Yuvraj Singh Pathania\nProprietor, PAT & J.K. Co.\nFounder and Creative Director, Phulhaar Gallery',
]

/** Sends what the team wrote, paragraph by paragraph, signed by the founder */
export const sendCuratorEmail = async (
  payload: Payload,
  curator: Curator,
  letter: { subject: string; body: string },
): Promise<boolean> => {
  const { BUSINESS_INBOX, deliver } = await import('@/email/send')
  const paragraphs = letter.body
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return deliver(
    payload,
    { to: curator.email, bcc: [BUSINESS_INBOX] },
    buildEmail({
      subject: letter.subject,
      preheader: paragraphs[1] ?? paragraphs[0] ?? letter.subject,
      parts: [
        ...[...paragraphs, ...SIGN_OFF].map((text): EmailPart => ({ kind: 'paragraph', text })),
        { kind: 'reference', label: 'Your application number', value: curator.reference },
      ],
      footer: await emailFooter(payload),
      recipient: { email: curator.email, name: curator.fullName },
    }),
  )
}

export type ArrivedCurator = {
  id: number
  reference: string
  fullName: string
  email: string
  phone: string
  city: string
  country: string
  role: string
  years: string
  areas: string[]
  wants: string
  portfolioLink?: string | null
  files: { kind: 'portfolio' | 'cv'; filename: string }[]
  keepOnFile: boolean
}

/** To business@ (the brief, section 11: alerts that are not technical go there) */
export const notifyStaffOfCurator = async (
  payload: Payload,
  curator: ArrivedCurator,
): Promise<boolean> => {
  const { BUSINESS_INBOX, deliver } = await import('@/email/send')
  const portfolio = [
    curator.portfolioLink,
    curator.files.find((f) => f.kind === 'portfolio')?.filename,
  ]
    .filter(Boolean)
    .join('\n')
  return deliver(
    payload,
    { to: BUSINESS_INBOX, replyTo: curator.email },
    buildEmail({
      subject: `Guest curator application: ${curator.fullName} (${curator.reference})`,
      preheader: `${curator.fullName}, ${curator.city}, ${curator.country}.`,
      parts: [
        {
          kind: 'paragraph',
          text: `${curator.fullName} has applied to curate with PJK. Nothing has been sent to them: answer from the Curators screen, where each email opens for editing first.`,
        },
        {
          kind: 'fields',
          rows: [
            { label: 'Application number', value: curator.reference },
            { label: 'Email address', value: curator.email },
            { label: 'Phone', value: curator.phone },
            { label: 'Based in', value: `${curator.city}, ${curator.country}` },
            {
              label: 'Role',
              value: `${curator.role} · ${labelOf(CURATOR_YEARS, curator.years)}`,
            },
            {
              label: 'Curates',
              value: curator.areas.map((a) => labelOf(CURATOR_AREAS, a)).join('; '),
            },
            { label: 'Wants', value: labelOf(CURATOR_WANTS, curator.wants) },
            { label: 'Portfolio', value: portfolio },
            { label: 'Keep on file', value: curator.keepOnFile ? 'Yes, for 12 months' : 'No' },
          ],
        },
        {
          kind: 'link',
          label: 'Open on the Curators screen',
          url: `${getServerSideURL()}/admin/curators?selected=${curator.id}`,
        },
      ],
      footer: await emailFooter(payload),
      recipient: { inbox: BUSINESS_INBOX },
    }),
  )
}
