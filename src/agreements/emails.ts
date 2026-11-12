import 'server-only'

import type { Payload } from 'payload'

import { emailFooter } from '@/email/footer'
import { buildEmail } from '@/email/layout'
import { staffInbox } from '@/members/emails'
import type { AgreementExecution } from '@/payload-types'
import { canSendEmail } from '@/security/email'
import { getServerSideURL } from '@/utilities/getURL'

import type { AgreementDocument } from './documents'

/** Where every executed agreement is also sent, as the founder asked on 10 November 2026 */
export const COMPLIANCE_INBOX = 'compliance@pjk.co.in'

const adminLink = (execution: AgreementExecution) =>
  `${getServerSideURL()}/admin/collections/agreement-executions/${execution.id}`

/** Staff hear that an agreement was signed and waits for the DSC countersignature */
export const notifyStaffOfSignedAgreement = async (
  payload: Payload,
  { execution, agreement }: { execution: AgreementExecution; agreement: AgreementDocument },
): Promise<boolean> => {
  const to = await staffInbox(payload)
  if (!to) return false
  const email = buildEmail({
    subject: `${execution.memberCode} signed the ${agreement.kind === 'artist' ? 'artist' : 'trade'} agreement`,
    preheader: 'It waits for the DSC countersignature.',
    parts: [
      {
        kind: 'paragraph',
        text: `${execution.memberCode} has signed the ${agreement.title}. It waits for the DSC countersignature. Download the signed PDF in the admin, countersign it, and upload it there: it is then sent to the ${agreement.signer.toLowerCase()} and to ${COMPLIANCE_INBOX}.`,
      },
      { kind: 'link', label: 'Open it in the admin', url: adminLink(execution) },
    ],
    footer: await emailFooter(payload),
  })
  if (!canSendEmail(payload)) {
    payload.logger.info(`[dev] Email "${email.subject}":\n${email.text}`)
    return true
  }
  await payload.sendEmail({ to, subject: email.subject, text: email.text, html: email.html })
  return true
}

/**
 * The executed agreement, countersigned with the DSC, to the signer and to compliance, attached as
 * the PDF exactly as uploaded. In PAT and J.K. Co.'s own template, with its social links.
 */
export const sendExecutedAgreement = async (
  payload: Payload,
  {
    execution,
    agreement,
    pdf,
    filename,
  }: {
    execution: AgreementExecution
    agreement: AgreementDocument
    pdf: Buffer
    filename: string
  },
): Promise<boolean> => {
  const to = [execution.signer?.email, COMPLIANCE_INBOX].filter(Boolean) as string[]
  const email = buildEmail({
    subject: `Your executed ${agreement.kind === 'artist' ? 'artist' : 'trade'} agreement, ${execution.memberCode}`,
    preheader: 'Countersigned by PAT and J.K. Co. The PDF is attached.',
    parts: [
      {
        kind: 'paragraph',
        text: `Thank you for signing the ${agreement.title}. PAT and J.K. Co. has now countersigned it with its digital signature certificate.`,
      },
      {
        kind: 'paragraph',
        text: 'The executed agreement is attached as a PDF. Please keep it for your records.',
      },
      { kind: 'reference', label: 'Your ID', value: execution.memberCode ?? '' },
      { kind: 'note', text: `Signed on ${execution.signedAtIst}. ${agreement.version}.` },
      { kind: 'mailto', text: 'Questions about the agreement go to', email: COMPLIANCE_INBOX },
    ],
    footer: await emailFooter(payload),
  })
  if (!canSendEmail(payload)) {
    if (process.env.NODE_ENV === 'production') return false
    payload.logger.info(`[dev] Email "${email.subject}" to ${to.join(', ')}:\n${email.text}`)
    return true
  }
  await payload.sendEmail({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
  })
  return true
}
