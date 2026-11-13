import 'server-only'

import type { Payload } from 'payload'

import { emailFooter } from '@/email/footer'
import { BRAND, buildEmail, type Recipient } from '@/email/layout'
import { BUSINESS_INBOX, COMPLIANCE_INBOX, deliver } from '@/email/send'
import type { AgreementExecution } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

import type { AgreementDocument } from './documents'

/** Where every executed agreement is also sent, as the founder asked on 10 November 2026 */
export { COMPLIANCE_INBOX }

const adminLink = (execution: AgreementExecution) =>
  `${getServerSideURL()}/admin/collections/agreement-executions/${execution.id}`

/** The agreement's full title and its date of effect, from its version line */
const titleAndDoe = (agreement: AgreementDocument) => {
  const [title, doe] = agreement.version.split(' DOE: ')
  return { title: title || agreement.title, doe: doe ?? '' }
}

const signerRecipient = (execution: AgreementExecution): Recipient => ({
  email: execution.signer?.email ?? '',
  name: execution.signer?.name || execution.signer?.firm || null,
})

/**
 * 26: business@, with compliance@ copied, hear that an agreement was signed and waits for the DSC
 * countersignature. 26B: the signer gets a receipt.
 */
export const notifyStaffOfSignedAgreement = async (
  payload: Payload,
  { execution, agreement }: { execution: AgreementExecution; agreement: AgreementDocument },
): Promise<boolean> => {
  const id = execution.memberCode ?? ''
  const { title } = titleAndDoe(agreement)
  const footer = await emailFooter(payload)
  const told = await deliver(
    payload,
    { to: BUSINESS_INBOX, cc: [COMPLIANCE_INBOX] },
    buildEmail({
      subject: `${id} signed the ${agreement.kind === 'artist' ? 'artist' : 'trade'} agreement (Awaiting DSC)`,
      preheader: 'Awaiting your Class 3 DSC countersignature in the admin panel.',
      parts: [
        {
          kind: 'paragraph',
          text: `Member ${id} has digitally signed the ${title}. The agreement is now queued for official Digital Signature Certificate (DSC) countersignature. Please download the signed PDF in the admin panel, apply the Class 3 DSC countersignature, and upload the executed PDF there to dispatch it automatically to the signer and ${COMPLIANCE_INBOX}.`,
        },
        { kind: 'reference', label: 'Member ID', value: id },
        { kind: 'link', label: 'Open execution record in admin', url: adminLink(execution) },
      ],
      footer,
      recipient: { inbox: BUSINESS_INBOX },
    }),
  )
  if (execution.signer?.email) {
    await deliver(
      payload,
      { to: execution.signer.email },
      buildEmail({
        subject: `Agreement signature recorded (${id}) | ${BRAND}`,
        preheader: `Your signed agreement has been recorded and is queued for ${BRAND} countersignature.`,
        parts: [
          {
            kind: 'paragraph',
            text: `Thank you for digitally signing your agreement with ${BRAND} (${id}). Your signature has been recorded, and the document is now queued for official Digital Signature Certificate (DSC) countersignature by ${BRAND} We will email you the final countersigned PDF as soon as execution is complete.`,
          },
        ],
        footer,
        recipient: signerRecipient(execution),
      }),
    )
  }
  return told
}

/**
 * 20: the executed agreement, countersigned with the DSC, to the signer, with compliance@ copied
 * and a blind copy to business@, attached as the PDF exactly as uploaded.
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
  const id = execution.memberCode ?? ''
  const { title, doe } = titleAndDoe(agreement)
  const email = buildEmail({
    subject: `Your executed agreement, ${id} | ${BRAND}`,
    preheader: `Countersigned by ${BRAND} The executed PDF is attached.`,
    parts: [
      {
        kind: 'paragraph',
        text: `Thank you for signing the ${title}. ${BRAND} has now countersigned the agreement using its official Digital Signature Certificate (DSC).`,
      },
      {
        kind: 'paragraph',
        text: 'The fully executed agreement is attached to this email as a PDF. Please retain this copy for your permanent records.',
      },
      { kind: 'reference', label: 'Your Member ID', value: id },
      {
        kind: 'paragraph',
        text: `Signed on ${execution.signedAtIst}. Document Reference: ${title}${doe ? ` (DOE: ${doe})` : ''}.`,
      },
      {
        kind: 'paragraph',
        text: `For any questions regarding your agreement, please write to ${COMPLIANCE_INBOX}.`,
      },
    ],
    footer: await emailFooter(payload),
    recipient: signerRecipient(execution),
  })
  const signer = execution.signer?.email
  return deliver(
    payload,
    {
      to: signer || COMPLIANCE_INBOX,
      cc: signer ? [COMPLIANCE_INBOX] : [],
      bcc: [BUSINESS_INBOX],
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    },
    email,
  )
}
