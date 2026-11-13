import type { Payload } from 'payload'

import { memberIdsOf } from '@/collections/Members'
import { BRAND, buildEmail, type BuiltEmail, type Recipient } from '@/email/layout'
import { emailFooter } from '@/email/footer'
import { BUSINESS_INBOX, COMPLIANCE_INBOX, deliver } from '@/email/send'
import type { Application, Member } from '@/payload-types'
import { OTP_TTL_MINUTES } from '@/security/constants'
import type { Purpose } from '@/security/challenges'
import { getServerSideURL } from '@/utilities/getURL'

import { APPLICATIONS_CONTACT } from './contact'
import type { Decision } from './decide'

/** Where questions about an application go (src/members/contact.ts) */
export { APPLICATIONS_CONTACT }

/** "11 April 2027", as the emails write dates */
export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })

/**
 * Every email to artists, partners and applicants, and every alert to PJK about them, in the
 * founder's words of 13 November 2026 (the numbers are those of the email previews).
 *
 * These emails never contain identity or bank details, or anything that would help someone who
 * got hold of the inbox: a code, a reference, a member ID, a link to sign in. Nothing more.
 */

const site = () => getServerSideURL()
const signInUrl = () => `${site()}/collaborate/signin`
const accountUrl = () => `${site()}/account`
const memberAdminUrl = (memberId: number | string) =>
  `${site()}/admin/collections/members/${memberId}`
const applicationAdminUrl = (id: number | string) =>
  `${site()}/admin/collections/applications/${id}`

const toBusiness: Recipient = { inbox: BUSINESS_INBOX }

/** The name on an application: the artist's legal name, or the partner's name or firm */
export const applicantName = (application?: Application | null): string | null =>
  !application
    ? null
    : application.type === 'artist'
      ? application.about?.legalName || application.about?.displayName || null
      : application.partner?.fullName || application.partner?.organisation || null

/** The member's name, from their latest application, for the confidentiality notice */
const memberName = async (payload: Payload, memberId: number): Promise<string | null> => {
  const found = await payload
    .find({
      collection: 'applications',
      where: { member: { equals: memberId } },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  return applicantName(found?.docs[0])
}

const toMember = async (payload: Payload, member: Member): Promise<Recipient> => ({
  email: member.email,
  name: await memberName(payload, member.id),
})

/** A member's artist or partner ID, as emails quote it */
const idOf = (member: Pick<Member, 'id' | 'artistId' | 'partnerId'>) =>
  memberIdsOf(member) ?? `Member ${member.id}`

/* ─── 01–05: codes ───────────────────────────────────────────────────────── */

const codeNote = (ending: string) =>
  `This code expires in ${OTP_TTL_MINUTES} minutes and works once. ${BRAND} will never ask you for this code by phone, SMS, or message. ${ending}`

export const memberCodeEmail = async (
  payload: Payload,
  { code, purpose, recipient }: { code: string; purpose: Purpose; recipient: Recipient },
): Promise<BuiltEmail> => {
  const footer = await emailFooter(payload)
  if (purpose === 'email-change') {
    return buildEmail({
      subject: `Confirm your new email address | ${BRAND}`,
      preheader: `Your confirmation code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Please enter the verification code below to set this address as the primary email for your ${BRAND} account.`,
        },
        { kind: 'code', code },
        {
          kind: 'paragraph',
          text: `This code expires in ${OTP_TTL_MINUTES} minutes and works once. If you did not request this update, please disregard this email; no changes will take effect without the code.`,
        },
      ],
      footer,
      recipient,
    })
  }
  if (purpose === 'step-up') {
    return buildEmail({
      subject: `Confirm a change to your ${BRAND} account`,
      preheader: `Your confirmation code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Please enter the verification code below to confirm a sensitive update to your ${BRAND} account, such as adding or modifying your payout bank details.`,
        },
        { kind: 'code', code },
        {
          kind: 'paragraph',
          text: `This code expires in ${OTP_TTL_MINUTES} minutes and works once. If you are not making an update to your account, do not enter this code—please notify us immediately at ${COMPLIANCE_INBOX} as someone may have active access to your session.`,
        },
      ],
      footer,
      recipient,
    })
  }
  if (purpose === 'signin') {
    return buildEmail({
      subject: `Your ${BRAND} sign-in code`,
      preheader: `Your sign-in code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Please use the one-time verification code below to sign in to your ${BRAND} account.`,
        },
        { kind: 'code', code },
        {
          kind: 'paragraph',
          text: codeNote('If you did not attempt to sign in, you may safely disregard this email.'),
        },
      ],
      footer,
      recipient,
    })
  }
  return buildEmail({
    subject: `Your ${BRAND} verification code`,
    preheader: `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    parts: [
      {
        kind: 'paragraph',
        text:
          purpose === 'apply-partner'
            ? `Please enter the verification code below to confirm your email address and begin your Trade Program application with ${BRAND}`
            : `Please enter the verification code below to confirm your email address and begin your artist application with ${BRAND}`,
      },
      { kind: 'code', code },
      {
        kind: 'paragraph',
        text: codeNote(
          'If you did not request this code, you may safely disregard this email; nothing will change without it.',
        ),
      },
    ],
    footer,
    recipient,
  })
}

/** 01–05. One-time codes go to the address alone: no copies */
export const sendMemberCode = async (
  payload: Payload,
  { email, code, purpose }: { email: string; code: string; purpose: Purpose },
): Promise<boolean> => {
  // Signing in, a member's name is known; a code to apply, or to confirm a new address, names
  // only the address (#01, #02, #05)
  const member = (
    await payload
      .find({
        collection: 'members',
        where: { email: { equals: email } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
  )?.docs[0]
  const name =
    member && (purpose === 'signin' || purpose === 'step-up')
      ? await memberName(payload, member.id)
      : null
  return deliver(
    payload,
    { to: email },
    await memberCodeEmail(payload, { code, purpose, recipient: { email, name } }),
  )
}

/* ─── 09–14: applications ───────────────────────────────────────────────── */

export const decisionEmail = async (
  payload: Payload,
  {
    decision,
    application,
    member,
  }: { decision: Exclude<Decision, 'review'>; application: Application; member?: Member },
): Promise<BuiltEmail> => {
  const artist = application.type === 'artist'
  const footer = await emailFooter(payload)
  const recipient: Recipient = {
    email: member?.email ?? '',
    name: applicantName(application),
  }

  if (decision === 'approve') {
    const id = application.issuedId ?? ''
    return buildEmail({
      subject: `Welcome to ${BRAND} | ${artist ? 'Artist' : 'Trade'} Application Approved`,
      preheader: `Your application has been approved. Your ${artist ? 'Artist' : 'Partner'} ID is ${id}.`,
      parts: [
        {
          kind: 'paragraph',
          text: `We are pleased to inform you that your application to join ${BRAND} as ${artist ? 'a represented artist' : 'a Trade Partner'} has been approved. We are delighted to welcome you.`,
        },
        { kind: 'reference', label: artist ? 'Your Artist ID' : 'Your Partner ID', value: id },
        {
          kind: 'paragraph',
          text: artist
            ? 'Please retain this permanent ID and quote it whenever you write to us. You may now sign in to your account using a code sent to this email address to complete your agreement execution and profile onboarding.'
            : 'Please retain this permanent ID and quote it whenever you write to us. You may now sign in to your account using a code sent to this email address to execute your Trade Partner Agreement and access your portal.',
        },
        { kind: 'link', label: 'Sign in', url: signInUrl() },
      ],
      footer,
      recipient,
    })
  }

  const note = application.decisionNote?.trim() ?? ''
  if (decision === 'request-changes') {
    return buildEmail({
      subject: `Updates requested for your ${BRAND} application (${application.reference})`,
      preheader: `We have reviewed your application ${application.reference} and added a note for you.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Thank you for submitting your application to ${BRAND} Before we can complete our evaluation, please review and address the following note from our team:`,
        },
        ...(note
          ? [{ kind: 'reference' as const, label: 'Note from Review Team', value: note }]
          : []),
        { kind: 'reference', label: 'Application Reference', value: application.reference },
        { kind: 'link', label: 'Sign in to update application', url: signInUrl() },
      ],
      footer,
      recipient,
    })
  }

  const reapplyFrom = (application as { reapplyFrom?: string | null }).reapplyFrom
  return buildEmail({
    subject: `Your application to ${BRAND} (${application.reference})`,
    preheader: `An update regarding your application ${application.reference}.`,
    parts: [
      {
        kind: 'paragraph',
        text: `Thank you for applying to ${BRAND} and for the time and care invested in your submission. After careful review, we are unable to accept your application at this time.`,
      },
      ...(note ? [{ kind: 'reference' as const, label: 'Review Note', value: note }] : []),
      ...(reapplyFrom
        ? [
            {
              kind: 'paragraph' as const,
              // Partners are asked for no identity documents or photographs, so their sentence
              // stops at reviewing their details
              text: artist
                ? `You are welcome to submit a fresh application from ${longDate(reapplyFrom)}. If you sign in with this email address after that date, your core application details will be available for you to review and only fresh identity verification documents and photographs will be required.`
                : `You are welcome to submit a fresh application from ${longDate(reapplyFrom)}. If you sign in with this email address after that date, your core application details will be available for you to review.`,
            },
          ]
        : []),
      { kind: 'reference', label: 'Application Reference', value: application.reference },
      {
        kind: 'paragraph',
        text: `For any further questions, please contact us at ${APPLICATIONS_CONTACT}.`,
      },
    ],
    footer,
    recipient,
  })
}

/** 11–14. The decision, with a blind copy to business@ for the record */
export const sendDecisionEmail = async (
  payload: Payload,
  args: { decision: Exclude<Decision, 'review'>; application: Application; member: Member },
): Promise<boolean> =>
  deliver(
    payload,
    { to: args.member.email, bcc: [BUSINESS_INBOX] },
    await decisionEmail(payload, args),
  )

export const applicationReceivedEmail = async (
  payload: Payload,
  { application, email }: { application: Application; email?: string },
): Promise<BuiltEmail> => {
  const artist = application.type === 'artist'
  return buildEmail({
    subject: artist
      ? `We have received your application | ${BRAND}`
      : `We have received your Trade Program application | ${BRAND}`,
    preheader: `Your application reference is ${application.reference}.`,
    parts: [
      {
        kind: 'paragraph',
        text: artist
          ? `Thank you for submitting your application to showcase your work with ${BRAND} and Phulhaar Gallery. Our curation team reviews every submission individually, and we will write to you as soon as our evaluation is complete.`
          : `Thank you for submitting your application to collaborate with ${BRAND} through our Trade Program. Our team reviews every application individually, and we will write to you once our review is complete.`,
      },
      { kind: 'reference', label: 'Your Application Reference', value: application.reference },
      {
        kind: 'paragraph',
        text: 'Please quote this reference in any correspondence with us. You may check the live status of your application at any time by signing in with a code sent to this email address.',
      },
      { kind: 'link', label: 'Sign in', url: signInUrl() },
    ],
    footer: await emailFooter(payload),
    recipient: { email: email ?? '', name: applicantName(application) },
  })
}

/** 09, 10. The receipt; #22 goes to business@ alongside it */
export const sendApplicationReceived = async (
  payload: Payload,
  { member, application }: { member: Member; application: Application },
): Promise<boolean> =>
  deliver(
    payload,
    { to: member.email },
    await applicationReceivedEmail(payload, { application, email: member.email }),
  )

/** 22. A new application, to business@ */
export const notifyStaffOfApplication = async (
  payload: Payload,
  { application, name }: { application: Application; name?: string | null },
): Promise<boolean> => {
  const kind = application.type === 'artist' ? 'artist' : 'partner'
  const who = name || applicantName(application) || 'An applicant'
  return deliver(
    payload,
    { to: BUSINESS_INBOX },
    buildEmail({
      subject: `New ${kind} application: ${application.reference}`,
      preheader: `${who} has submitted an application (${application.reference}).`,
      parts: [
        { kind: 'paragraph', text: `${who} has submitted a new ${kind} application for review.` },
        { kind: 'reference', label: 'Application Reference', value: application.reference },
        {
          kind: 'link',
          label: 'Open application in admin',
          url: applicationAdminUrl(application.id),
        },
      ],
      footer: await emailFooter(payload),
      recipient: toBusiness,
    }),
  )
}

/** 23 to business@, and 23B to the applicant with a blind copy to business@ */
export const notifyStaffOfWithdrawal = async (
  payload: Payload,
  { application, member }: { application: Application; member?: Member | null },
): Promise<boolean> => {
  const kind = application.type === 'artist' ? 'artist' : 'partner'
  const footer = await emailFooter(payload)
  const told = await deliver(
    payload,
    { to: BUSINESS_INBOX },
    buildEmail({
      subject: `Application ${application.reference} withdrawn`,
      preheader: `The applicant has withdrawn their ${kind} application.`,
      parts: [
        {
          kind: 'paragraph',
          text: `The applicant has withdrawn their ${kind} application. No further review or decision is required.`,
        },
        { kind: 'reference', label: 'Application Reference', value: application.reference },
        { kind: 'link', label: 'Open record in admin', url: applicationAdminUrl(application.id) },
      ],
      footer,
      recipient: toBusiness,
    }),
  )
  if (!member?.email) return told
  await deliver(
    payload,
    { to: member.email, bcc: [BUSINESS_INBOX] },
    buildEmail({
      subject: `Your ${BRAND} application (${application.reference}) has been withdrawn`,
      preheader: `Confirmation that application ${application.reference} has been withdrawn at your request.`,
      parts: [
        {
          kind: 'paragraph',
          text: `This confirms that your application to ${BRAND} (Reference: ${application.reference}) has been withdrawn at your request, and no further processing will take place.`,
        },
        {
          kind: 'paragraph',
          text: `If you have any questions, please write to us at ${APPLICATIONS_CONTACT}.`,
        },
      ],
      footer,
      recipient: { email: member.email, name: applicantName(application) },
    }),
  )
  return told
}

/* ─── 17–19, 27–29: payouts ─────────────────────────────────────────────── */

/**
 * 17. An approved artist is asked to add payout details. It points to their account and nothing
 * else: it never asks for bank details and never contains any, and says so.
 */
export const sendPayoutDetailsRequest = async (
  payload: Payload,
  { member }: { member: Member },
): Promise<boolean> =>
  deliver(
    payload,
    { to: member.email, bcc: [BUSINESS_INBOX] },
    buildEmail({
      subject: `Action Required: Add your payout details | ${BRAND}`,
      preheader:
        'Add your bank details securely in your PJK account. We never ask for bank details by email.',
      parts: [
        {
          kind: 'paragraph',
          text: `We are ready to set up your account for settlement payouts. To enable transfers, please register your payout bank account details inside your ${BRAND} account portal.`,
        },
        {
          kind: 'paragraph',
          text: 'For your security, we will email you a one-time verification code before you enter your banking details. Prior to releasing your first payout, we will transfer a ₹1 test deposit to your account and ask you to confirm receipt.',
        },
        { kind: 'link', label: 'Add payout details', url: `${site()}/account/payouts` },
        {
          kind: 'paragraph',
          text: `Security Notice: ${BRAND} never requests or sends bank account details by email. Please do not reply to this email with your banking details. If you ever receive a message claiming to be from us that asks for bank details directly, do not respond and report it immediately to ${COMPLIANCE_INBOX}.`,
        },
      ],
      footer: await emailFooter(payload),
      recipient: await toMember(payload, member),
    }),
  )

/**
 * 18, 19. After payout details are added or changed. Says only that it happened: never the
 * details. The button lets the real owner stop it if it was not them.
 */
export const sendBankChangeNotice = async (
  payload: Payload,
  { member, cancelToken, first }: { member: Member; cancelToken: string; first?: boolean },
): Promise<boolean> =>
  deliver(
    payload,
    { to: member.email },
    buildEmail({
      subject: first
        ? `Payout details added to your ${BRAND} account`
        : `Your ${BRAND} bank details were changed`,
      preheader: first
        ? 'If you did not make this change, cancel it immediately.'
        : 'If you did not request this change, stop it immediately.',
      parts: [
        {
          kind: 'paragraph',
          text: first
            ? `Payout bank account details have just been added to your ${BRAND} account. Our team will verify the account with a ₹1 test transfer before activating it for settlements.`
            : `A request was submitted on your ${BRAND} account to change your payout bank account details. We will verify the new details before activating them; until verification is complete, your existing bank account remains unchanged.`,
        },
        {
          kind: 'paragraph',
          text: first
            ? 'If you added these details, no further action is needed.'
            : 'If you made this update, no further action is needed.',
        },
        {
          kind: 'paragraph',
          text: first
            ? `If you did not make this change, click the button below immediately to block the update and sign out every device connected to your account, then notify us at once at ${COMPLIANCE_INBOX}.`
            : `If you did not request this change, click the button below immediately to stop the change and sign out every device connected to your account, then notify us at once at ${COMPLIANCE_INBOX}.`,
        },
        {
          kind: 'link',
          label: 'This was not me',
          url: `${site()}/account/bank-change/cancel?t=${encodeURIComponent(cancelToken)}`,
        },
      ],
      footer: await emailFooter(payload),
      recipient: await toMember(payload, member),
    }),
  )

/** 27, 28 to business@; 29 (stopped by the member) to business@ with compliance@ copied */
export const notifyStaffOfBankChange = async (
  payload: Payload,
  {
    member,
    cancelled,
    first,
  }: {
    member: Pick<Member, 'id' | 'artistId' | 'partnerId'>
    cancelled?: boolean
    first?: boolean
  },
): Promise<boolean> => {
  const id = idOf(member)
  const callout = { kind: 'reference' as const, label: 'Member ID', value: id }
  const email = cancelled
    ? buildEmail({
        subject: `URGENT: Bank change stopped by member (${id})`,
        preheader: `Member ${id} reported an unauthorised bank change. All sessions have been terminated.`,
        parts: [
          {
            kind: 'paragraph',
            text: `Member ${id} reported that they did not authorise the recent change to their payout bank details. The bank change has been blocked automatically and every active session on the account has been terminated at once. Please contact the member immediately to verify their account security.`,
          },
          callout,
          { kind: 'link', label: 'Open member record in admin', url: memberAdminUrl(member.id) },
        ],
        footer: await emailFooter(payload),
        recipient: toBusiness,
      })
    : buildEmail({
        subject: first
          ? `Payout details waiting for verification: ${id}`
          : `Bank details change waiting for verification: ${id}`,
        preheader: first
          ? 'Verify the new bank details via ₹1 test transfer before approving.'
          : 'Verify the updated bank details via ₹1 test transfer before approving.',
        parts: [
          {
            kind: 'paragraph',
            text: first
              ? `Member ${id} has added first-time payout bank details. Please send a ₹1 test transfer to the account, ask the member to confirm receipt, and then approve the payout details inside their KYC record.`
              : `Member ${id} has requested a change to their payout bank details. Please send a ₹1 test transfer to the new account, ask the member to confirm receipt, and then approve the updated details inside their KYC record.`,
          },
          callout,
          { kind: 'link', label: 'Open KYC record in admin', url: memberAdminUrl(member.id) },
        ],
        footer: await emailFooter(payload),
        recipient: toBusiness,
      })
  return deliver(
    payload,
    { to: BUSINESS_INBOX, ...(cancelled ? { cc: [COMPLIANCE_INBOX] } : {}) },
    email,
  )
}

/* ─── 30–33: data protection ─────────────────────────────────────────────── */

export type DataRequestKind = 'withdraw-consent' | 'delete' | 'download'

const DATA_REQUEST: Record<
  DataRequestKind,
  {
    subject: (id: string) => string
    preheader: (id: string) => string
    next: (id: string) => string
  }
> = {
  download: {
    subject: (id) => `Copy of personal data requested: ${id}`,
    preheader: (id) =>
      `Statutory DPDP Act data request from ${id}. Respond within the statutory timeframe.`,
    next: () =>
      'Please compile a copy of their personal data and dispatch it to them in accordance with docs/KYC.md within the statutory timeframe mandated by the DPDP Act, 2023.',
  },
  'withdraw-consent': {
    subject: (id) => `Consent withdrawn: ${id}`,
    preheader: (id) =>
      `Member ${id} has withdrawn consent. Unpublish their profile and works from Phulhaar.`,
    next: () =>
      'Active data processing for this member has been halted. Please open their record in the admin panel immediately and click "Unpublish Profile & Artworks from Phulhaar".',
  },
  delete: {
    subject: (id) => `Account deletion requested: ${id}`,
    preheader: (id) =>
      `Member ${id} has requested account deletion. Process within the statutory timeframe.`,
    next: (id) =>
      `Please open their record in the admin panel and execute "Delete this person". Any records required to be retained by law will remain encrypted under their member ID (${id}).`,
  },
}

const DATA_REQUEST_RECEIPT: Record<
  DataRequestKind,
  { subject: (id: string) => string; preheader: string; body: (id: string) => string }
> = {
  download: {
    subject: (id) => `We have received your data copy request (${id}) | ${BRAND}`,
    preheader: 'Your request for a copy of your personal data has been logged.',
    body: (id) =>
      `We have received your request under the Digital Personal Data Protection Act, 2023 for a copy of the personal data held on your ${BRAND} account (${id}). Our compliance team is preparing your records and will send them to this registered email address within the statutory timeframe.`,
  },
  'withdraw-consent': {
    subject: (id) => `Confirmation: Withdrawal of consent logged (${id}) | ${BRAND}`,
    preheader: 'Your withdrawal of consent has been recorded.',
    body: (id) =>
      `We have recorded your withdrawal of consent for your ${BRAND} account (${id}) under the Digital Personal Data Protection Act, 2023. Active processing of your account has ceased and your public profile and works have been queued for removal from Phulhaar Gallery, subject to any active commercial obligations and mandatory statutory tax retention requirements under Indian law.`,
  },
  delete: {
    subject: (id) => `We have received your account deletion request (${id}) | ${BRAND}`,
    preheader: 'Your account deletion request is being processed by our compliance team.',
    body: (id) =>
      `We have received your request to delete your ${BRAND} account (${id}). Our compliance team is processing your request and you will receive a final confirmation email as soon as your account erasure is complete.`,
  },
}

/**
 * 30–32 to business@ with compliance@ copied: only the kind and the member's ID, with a link to
 * their record. And 30B–32B, the acknowledgement to the member, with a blind copy to business@.
 */
export const notifyStaffOfDataRequest = async (
  payload: Payload,
  {
    reference,
    request,
    kind,
    memberId,
    member,
  }: {
    reference?: string | null
    request: string
    kind: DataRequestKind
    memberId: number
    member?: Member | null
  },
): Promise<boolean> => {
  const id = reference ?? `Member ${memberId}`
  const footer = await emailFooter(payload)
  const what = DATA_REQUEST[kind]
  const told = await deliver(
    payload,
    { to: BUSINESS_INBOX, cc: [COMPLIANCE_INBOX] },
    buildEmail({
      subject: what.subject(id),
      preheader: what.preheader(id),
      parts: [
        { kind: 'paragraph', text: `Member ${id} has submitted a formal request: "${request}."` },
        { kind: 'paragraph', text: what.next(id) },
        { kind: 'link', label: 'Open member record', url: memberAdminUrl(memberId) },
      ],
      footer,
      recipient: toBusiness,
    }),
  )
  if (member?.email) {
    const receipt = DATA_REQUEST_RECEIPT[kind]
    await deliver(
      payload,
      { to: member.email, bcc: [BUSINESS_INBOX] },
      buildEmail({
        subject: receipt.subject(id),
        preheader: receipt.preheader,
        parts: [
          { kind: 'paragraph', text: receipt.body(id) },
          {
            kind: 'paragraph',
            text:
              kind === 'download'
                ? `For any compliance inquiries, please write to ${COMPLIANCE_INBOX}.`
                : kind === 'delete'
                  ? `For any questions, please contact ${COMPLIANCE_INBOX}.`
                  : `For any questions, please write to ${COMPLIANCE_INBOX}.`,
          },
        ],
        footer,
        recipient: await toMember(payload, member),
      }),
    )
  }
  return told
}

/**
 * 33 to business@: a member changed their phone, address or email address. And, when it was the
 * phone or address, 33B to the member (an email change has its own notice, #06).
 */
export const notifyStaffOfPersonalChange = async (
  payload: Payload,
  {
    memberId,
    adminPath,
    member,
  }: { what?: string; memberId: string; adminPath: string; member?: Member | null },
): Promise<boolean> => {
  const footer = await emailFooter(payload)
  const told = await deliver(
    payload,
    { to: BUSINESS_INBOX },
    buildEmail({
      subject: `Contact details updated by ${memberId}`,
      preheader: `Please review the updated contact details for ${memberId}.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Member ${memberId} has updated their registered contact details (telephone, address, or email address). Please review the updated record in the admin panel.`,
        },
        { kind: 'link', label: 'Open member record', url: `${site()}${adminPath}` },
      ],
      footer,
      recipient: toBusiness,
    }),
  )
  if (member?.email) {
    await deliver(
      payload,
      { to: member.email },
      buildEmail({
        subject: `Your ${BRAND} contact details have been updated`,
        preheader: 'Confirmation of recent updates to your contact details.',
        parts: [
          {
            kind: 'paragraph',
            text: `The contact details registered to your ${BRAND} account (${memberId}) have just been updated. If you made this change, no further action is needed.`,
          },
          {
            kind: 'paragraph',
            text: `If you did not authorise this update, please notify us immediately at ${COMPLIANCE_INBOX}.`,
          },
        ],
        footer,
        recipient: await toMember(payload, member),
      }),
    )
  }
  return told
}

/* ─── 21: deletion ──────────────────────────────────────────────────────── */

/**
 * 21. Tells someone their account has been deleted, after the erasure has gone through, at the
 * address they had, with blind copies to business@ and compliance@. The paragraph about what is
 * kept appears only when the law made us keep their identity and payout records (a legal hold):
 * otherwise those were purged with everything else.
 */
export const sendAccountErased = async (
  payload: Payload,
  {
    to,
    id,
    name,
    keptUntil,
  }: { to: string; id: string; name?: string | null; keptUntil?: string | null },
): Promise<boolean> =>
  deliver(
    payload,
    { to, bcc: [BUSINESS_INBOX, COMPLIANCE_INBOX] },
    buildEmail({
      subject: `Your ${BRAND} account has been deleted`,
      preheader: 'Your active profile and personal details have been erased.',
      parts: [
        {
          kind: 'paragraph',
          text: `Your ${BRAND} account (${id}) has been permanently deleted, and the active personal details associated with it—including your name, contact details, address, profile biography, photographs, and active sign-in sessions—have been erased. You can no longer sign in using this email address.`,
        },
        ...(keptUntil
          ? [
              {
                kind: 'paragraph' as const,
                text: `In compliance with Indian tax and audit laws (Section 8(7) of the DPDP Act, 2023, the Income Tax Act, 1961, and the CGST Act, 2017), we are legally required to retain your identity verification and payout records under your reference ID (${id}) until ${longDate(keptUntil)}. These records are stored in an encrypted vault, used for no other purpose, and automatically purged once the statutory retention period expires.`,
              },
            ]
          : []),
        {
          kind: 'paragraph',
          text: `If you did not expect this notice, please contact us immediately at ${COMPLIANCE_INBOX}.`,
        },
      ],
      footer: await emailFooter(payload),
      recipient: { email: to, name },
    }),
  )

/* ─── 06–08: email address changes ──────────────────────────────────────── */

/** 06. Tells the old address that the account's email changed; blind copy to business@ */
export const sendEmailChangedNotice = async (
  payload: Payload,
  { oldEmail, member }: { oldEmail: string; member?: Member | null },
): Promise<boolean> =>
  deliver(
    payload,
    { to: oldEmail, bcc: [BUSINESS_INBOX] },
    buildEmail({
      subject: `The email address on your ${BRAND} account has changed`,
      preheader: 'If you made this change, no further action is needed.',
      parts: [
        {
          kind: 'paragraph',
          text: `The primary email address registered to your ${BRAND} account has just been changed and verified with a security code sent to your new address. All future sign-in codes and account notices will be delivered to the new email address.`,
        },
        {
          kind: 'paragraph',
          text: `If you authorised this update, no further action is required. If you did not make this change, please contact us immediately at ${COMPLIANCE_INBOX} or ${APPLICATIONS_CONTACT} so we can secure your account and reverse the change.`,
        },
      ],
      footer: await emailFooter(payload),
      recipient: {
        email: oldEmail,
        name: member ? await memberName(payload, member.id) : null,
      },
    }),
  )

/**
 * 07, 08. Both addresses hear when our team changes the address on an account, at the member's
 * request after an identity check; blind copies to business@
 */
export const sendStaffEmailChangeNotices = async (
  payload: Payload,
  { oldEmail, newEmail, memberId }: { oldEmail: string; newEmail: string; memberId?: number },
): Promise<void> => {
  const footer = await emailFooter(payload)
  const name = memberId ? await memberName(payload, memberId) : null
  await deliver(
    payload,
    { to: oldEmail, bcc: [BUSINESS_INBOX] },
    buildEmail({
      subject: `The email address on your ${BRAND} account has changed`,
      preheader:
        'Our team updated your email address at your request following identity verification.',
      parts: [
        {
          kind: 'paragraph',
          text: `Following your request and completion of our identity verification check, our administration team has updated the primary email address on your ${BRAND} account. All future sign-in codes will be sent to your new email address, and all active sessions across your devices have been signed out.`,
        },
        {
          kind: 'paragraph',
          text: `If you did not request this change, please write to us immediately at ${COMPLIANCE_INBOX} or ${APPLICATIONS_CONTACT} so we can secure your account.`,
        },
      ],
      footer,
      recipient: { email: oldEmail, name },
    }),
  )
  await deliver(
    payload,
    { to: newEmail, bcc: [BUSINESS_INBOX] },
    buildEmail({
      subject: `Your ${BRAND} account now uses this email address`,
      preheader: 'You may now sign in using a verification code sent to this address.',
      parts: [
        {
          kind: 'paragraph',
          text: `At your request, and following verification of your identity, our team has designated this address as the primary email for your ${BRAND} account. You may now sign in using a one-time code sent to this address.`,
        },
        { kind: 'link', label: 'Sign in', url: signInUrl() },
        {
          kind: 'paragraph',
          text: `If you did not request this update, please notify us immediately at ${APPLICATIONS_CONTACT}.`,
        },
      ],
      footer,
      recipient: { email: newEmail, name },
    }),
  )
}

/* ─── 15, 16, 24, 25: profile and works ─────────────────────────────────── */

/** 15, 16. The artist hears what staff decided about their profile; blind copy to business@ */
export const sendReviewDecision = async (
  payload: Payload,
  {
    to,
    approved,
    note,
    member,
  }: { to: string; what?: string; approved: boolean; note?: string | null; member?: Member | null },
): Promise<boolean> =>
  deliver(
    payload,
    { to, bcc: [BUSINESS_INBOX] },
    buildEmail({
      subject: approved
        ? `Your artist profile is now public | ${BRAND}`
        : `Updates requested for your profile | ${BRAND}`,
      preheader: approved
        ? 'Your profile has been approved and can now be viewed through Phulhaar.'
        : 'Our team has requested a few updates before your profile is published.',
      parts: [
        {
          kind: 'paragraph',
          text: approved
            ? 'Your artist profile has been approved by our curation team and is now published for viewing through Phulhaar Gallery.'
            : 'We have reviewed your profile submission and require the following adjustment(s) before publishing it on Phulhaar Gallery:',
        },
        ...(!approved && note?.trim()
          ? [{ kind: 'reference' as const, label: 'Note from Review Team', value: note.trim() }]
          : []),
        { kind: 'link', label: 'Your account', url: accountUrl() },
      ],
      footer: await emailFooter(payload),
      recipient: { email: to, name: member ? await memberName(payload, member.id) : null },
    }),
  )

/** 25 to business@, and 25B to the artist */
export const notifyStaffOfWorksFolder = async (
  payload: Payload,
  { memberId, adminPath, member }: { memberId: string; adminPath: string; member?: Member | null },
): Promise<boolean> => {
  const footer = await emailFooter(payload)
  const told = await deliver(
    payload,
    { to: BUSINESS_INBOX },
    buildEmail({
      subject: `Works folder updated by ${memberId}`,
      preheader: `${memberId} has added or updated their Google Drive artwork folder.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Artist ${memberId} has added or updated the Google Drive folder containing their artwork submissions. Each work is organised in a subfolder named after the piece, containing its photographs, video, and description.`,
        },
        { kind: 'reference', label: 'Artist ID', value: memberId },
        { kind: 'link', label: 'Open artist in admin', url: `${site()}${adminPath}` },
      ],
      footer,
      recipient: toBusiness,
    }),
  )
  if (member?.email) {
    await deliver(
      payload,
      { to: member.email },
      buildEmail({
        subject: `Your Google Drive works folder link has been saved | ${BRAND}`,
        preheader: `We have logged the updated Google Drive works folder for ${memberId}.`,
        parts: [
          {
            kind: 'paragraph',
            text: `We have recorded the Google Drive works folder link on your ${BRAND} account (${memberId}). Please ensure that viewing permissions remain enabled on your folder so our curation team can review and archive your works.`,
          },
          { kind: 'link', label: 'Your account', url: accountUrl() },
        ],
        footer,
        recipient: await toMember(payload, member),
      }),
    )
  }
  return told
}

/** 24 to business@, and 24B to the artist */
export const notifyStaffOfReview = async (
  payload: Payload,
  {
    memberId,
    adminPath,
    member,
  }: { what?: string; memberId: string; adminPath: string; member?: Member | null },
): Promise<boolean> => {
  const footer = await emailFooter(payload)
  const told = await deliver(
    payload,
    { to: BUSINESS_INBOX },
    buildEmail({
      subject: `Waiting for review: Profile from ${memberId}`,
      preheader: `Artist ${memberId} has submitted profile updates for review.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Member ${memberId} has submitted profile changes for curation review.`,
        },
        { kind: 'reference', label: 'Member ID', value: memberId },
        { kind: 'link', label: 'Review profile in admin', url: `${site()}${adminPath}` },
      ],
      footer,
      recipient: toBusiness,
    }),
  )
  if (member?.email) {
    await deliver(
      payload,
      { to: member.email },
      buildEmail({
        subject: `We have received your profile updates | ${BRAND}`,
        preheader: `Your profile updates (${memberId}) are now under curation review.`,
        parts: [
          {
            kind: 'paragraph',
            text: `We have received the updates to your artist profile (${memberId}). Our curation team will review your changes and notify you by email once your updated profile is published on Phulhaar Gallery.`,
          },
          { kind: 'link', label: 'Your account', url: accountUrl() },
        ],
        footer,
        recipient: await toMember(payload, member),
      }),
    )
  }
  return told
}
