import type { Payload } from 'payload'

import { buildEmail, type BuiltEmail } from '@/email/layout'
import { emailFooter } from '@/email/footer'
import type { Application, Member } from '@/payload-types'
import { canSendEmail } from '@/security/email'
import { OTP_TTL_MINUTES } from '@/security/constants'
import type { Purpose } from '@/security/challenges'
import { phulhaarSocialLinks } from '@/brands/socialIcons'
import { getServerSideURL } from '@/utilities/getURL'

import { APPLICATIONS_CONTACT } from './contact'
import type { Decision } from './decide'
import { defaultSiteSettings } from './openness'

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
 * What members are told, and when. In the site's voice: short, plain, no exclamation marks.
 *
 * These emails never contain identity or bank details, or anything that would help someone who
 * got hold of the inbox: a code, a reference, a member ID, a link to sign in. Nothing more.
 */

const isProduction = process.env.NODE_ENV === 'production'

/** Sends an email; in development without an email service, prints that one was "sent". */
const send = async (payload: Payload, to: string, email: BuiltEmail): Promise<boolean> => {
  if (!canSendEmail(payload)) {
    if (isProduction) {
      payload.logger.error('No email service configured; a member email was not sent')
      return false
    }
    payload.logger.info(`[dev] Email "${email.subject}":\n${email.text}`)
    return true
  }
  try {
    await payload.sendEmail({ to, subject: email.subject, text: email.text, html: email.html })
    return true
  } catch (error) {
    payload.logger.error({ err: error, msg: `Could not send "${email.subject}"` })
    return false
  }
}

export const memberCodeEmail = async (
  payload: Payload,
  { code, purpose }: { code: string; purpose: Purpose },
): Promise<BuiltEmail> => {
  if (purpose === 'email-change') {
    return buildEmail({
      subject: 'Confirm your new email address',
      preheader: `Your code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      parts: [
        {
          kind: 'paragraph',
          text: 'Here is the code to make this the email address for your PAT and J.K. Co. account.',
        },
        { kind: 'code', code },
        {
          kind: 'note',
          text: `It expires in ${OTP_TTL_MINUTES} minutes and works once. If you did not ask for this, ignore this email: nothing changes without the code.`,
        },
      ],
      footer: await emailFooter(payload),
    })
  }
  if (purpose === 'step-up') {
    return buildEmail({
      subject: 'Confirm a change to your PJK account',
      preheader: `Your code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      parts: [
        {
          kind: 'paragraph',
          text: 'Here is the code to confirm a change to your account, such as adding or changing payout details.',
        },
        { kind: 'code', code },
        {
          kind: 'note',
          text: `It expires in ${OTP_TTL_MINUTES} minutes and works once. If you are not changing anything, do not use it, and please tell us: someone may be signed in as you.`,
        },
      ],
      footer: await emailFooter(payload),
    })
  }
  const applying = purpose !== 'signin'
  return buildEmail({
    subject: applying ? 'Your PJK verification code' : 'Your PJK sign-in code',
    preheader: `Your code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
    parts: [
      {
        kind: 'paragraph',
        text: applying
          ? 'Here is the code to confirm your email address and begin your application.'
          : 'Here is your code to sign in to PAT and J.K. Co.',
      },
      { kind: 'code', code },
      {
        kind: 'note',
        text: `It expires in ${OTP_TTL_MINUTES} minutes and works once. We will never ask you for it by phone or message.`,
      },
      {
        kind: 'note',
        text: 'If you did not ask for this code, you can ignore this email. Nothing happens without it.',
      },
    ],
    footer: await emailFooter(payload),
  })
}

export const sendMemberCode = async (
  payload: Payload,
  { email, code, purpose }: { email: string; code: string; purpose: Purpose },
): Promise<boolean> => send(payload, email, await memberCodeEmail(payload, { code, purpose }))

export const decisionEmail = async (
  payload: Payload,
  {
    decision,
    application,
  }: { decision: Exclude<Decision, 'review'>; application: Application; member?: Member },
): Promise<BuiltEmail> => {
  const signIn = `${getServerSideURL()}/collaborate/signin`
  const kind = application.type === 'artist' ? 'artist' : 'partner'
  const footer = await emailFooter(payload)

  if (decision === 'approve') {
    return buildEmail({
      subject: 'Welcome to PAT and J.K. Co.',
      preheader: `Your application has been approved. Your member ID is ${application.issuedId}.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Your application to join us as ${kind === 'artist' ? 'an artist' : 'a partner'} has been approved. We are glad to have you.`,
        },
        {
          kind: 'reference',
          label: kind === 'artist' ? 'Your artist ID' : 'Your partner ID',
          value: application.issuedId ?? '',
        },
        {
          kind: 'paragraph',
          text: 'Quote it whenever you write to us. You can now sign in to your account with a code sent to this address.',
        },
        { kind: 'link', label: 'Sign in', url: signIn },
      ],
      footer,
    })
  }

  const note = application.decisionNote ?? ''
  if (decision === 'request-changes') {
    return buildEmail({
      subject: 'A few changes to your application',
      preheader: `We have read your application ${application.reference} and have a note for you.`,
      parts: [
        {
          kind: 'paragraph',
          text: 'Thank you for your application. Before we can go further, we would like you to look at one or two things.',
        },
        { kind: 'paragraph', text: note },
        { kind: 'reference', label: 'Application reference', value: application.reference },
        { kind: 'link', label: 'Sign in to update it', url: signIn },
      ],
      footer,
    })
  }

  const settings = await defaultSiteSettings(payload).catch(() => null)
  const socials = kind === 'artist' ? phulhaarSocialLinks(settings?.phulhaarSocial) : []
  const reapplyFrom = (application as { reapplyFrom?: string | null }).reapplyFrom
  return buildEmail({
    subject: 'Your application to PAT and J.K. Co.',
    preheader: `About your application ${application.reference}.`,
    parts: [
      {
        kind: 'paragraph',
        text: 'Thank you for applying, and for the time you gave it. We are not able to accept your application this time.',
      },
      ...(note ? [{ kind: 'paragraph' as const, text: note }] : []),
      ...(reapplyFrom
        ? [
            {
              kind: 'paragraph' as const,
              text: `You are welcome to apply again from ${longDate(reapplyFrom)}. Sign in with this email address and your answers will be there to review${kind === 'artist' ? '; only your identity documents and photo are asked for again' : ''}.`,
            },
          ]
        : []),
      { kind: 'reference', label: 'Application reference', value: application.reference },
      {
        kind: 'mailto',
        text: 'For any further questions, contact us at',
        email: APPLICATIONS_CONTACT,
      },
      ...(socials.length
        ? [{ kind: 'socials' as const, heading: 'Follow Phulhaar', links: socials }]
        : []),
    ],
    footer,
  })
}

export const sendDecisionEmail = async (
  payload: Payload,
  args: { decision: Exclude<Decision, 'review'>; application: Application; member: Member },
): Promise<boolean> => send(payload, args.member.email, await decisionEmail(payload, args))

export const applicationReceivedEmail = async (
  payload: Payload,
  { application }: { application: Application },
): Promise<BuiltEmail> => {
  const artist = application.type === 'artist'
  return buildEmail({
    subject: 'We have your application',
    preheader: `Your application reference is ${application.reference}.`,
    parts: [
      {
        kind: 'paragraph',
        text: artist
          ? 'Thank you for applying to show your work with us. We look at every application ourselves, and we will write to you once we have.'
          : 'Thank you for writing to us about working together. We read every application ourselves, and we will be in touch.',
      },
      { kind: 'reference', label: 'Your application reference', value: application.reference },
      {
        kind: 'note',
        text: 'Quote it if you write to us. You can see where your application has got to by signing in with a code sent to this address.',
      },
      { kind: 'link', label: 'Sign in', url: `${getServerSideURL()}/collaborate/signin` },
    ],
    footer: await emailFooter(payload),
  })
}

export const sendApplicationReceived = async (
  payload: Payload,
  { member, application }: { member: Member; application: Application },
): Promise<boolean> =>
  send(payload, member.email, await applicationReceivedEmail(payload, { application }))

/**
 * Tells staff a new application is waiting. To the business inbox in Site settings, falling back
 * to the general one. The applicant's name and the reference only: everything else is in the admin.
 */
export const notifyStaffOfApplication = async (
  payload: Payload,
  { application, name }: { application: Application; name?: string | null },
): Promise<boolean> => {
  const settings = (
    await payload.find({
      collection: 'site-settings',
      where: { 'tenant.slug': { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  const to = settings?.businessEmail || settings?.email || process.env.CONTACT_INBOX
  if (!to) return false
  const kind = application.type === 'artist' ? 'artist' : 'partner'
  const email = buildEmail({
    subject: `New ${kind} application ${application.reference}`,
    preheader: `${name || 'Someone'} has sent a ${kind} application.`,
    parts: [
      { kind: 'paragraph', text: `${name || 'Someone'} has sent a ${kind} application.` },
      { kind: 'reference', label: 'Reference', value: application.reference },
      {
        kind: 'link',
        label: 'Open it in the admin',
        url: `${getServerSideURL()}/admin/collections/applications/${application.id}`,
      },
    ],
    footer: await emailFooter(payload),
  })
  return send(payload, to, email)
}

/** Tells staff an applicant has withdrawn an application they had sent */
export const notifyStaffOfWithdrawal = async (
  payload: Payload,
  { application }: { application: Application },
): Promise<boolean> => {
  const settings = await defaultSiteSettings(payload).catch(() => null)
  const to = settings?.businessEmail || settings?.email || process.env.CONTACT_INBOX
  if (!to) return false
  const kind = application.type === 'artist' ? 'artist' : 'partner'
  return send(
    payload,
    to,
    buildEmail({
      subject: `Application ${application.reference} withdrawn`,
      preheader: `The applicant has withdrawn their ${kind} application.`,
      parts: [
        {
          kind: 'paragraph',
          text: `The applicant has withdrawn their ${kind} application. There is nothing more to decide on it.`,
        },
        { kind: 'reference', label: 'Reference', value: application.reference },
        {
          kind: 'link',
          label: 'Open it in the admin',
          url: `${getServerSideURL()}/admin/collections/applications/${application.id}`,
        },
      ],
      footer: await emailFooter(payload),
    }),
  )
}

/**
 * An approved artist is asked to add payout details, because a sale needs a payout. It points to
 * their account and nothing else: it never asks for bank details and never contains any, and says
 * so, because an email asking for them is the commonest way to steal a payment.
 */
export const sendPayoutDetailsRequest = async (
  payload: Payload,
  { member }: { member: Member },
): Promise<boolean> =>
  send(
    payload,
    member.email,
    buildEmail({
      subject: 'Add your payout details',
      preheader: 'Add them in your PJK account. We never ask for bank details by email.',
      parts: [
        {
          kind: 'paragraph',
          text: 'We are ready to pay you for your work. To do that, we need to know which bank account to pay into.',
        },
        {
          kind: 'paragraph',
          text: 'Please add it in your account. We will email you a code first, to be sure it is you, and before the first payment we send ₹1 to the account and ask you to confirm it arrived.',
        },
        {
          kind: 'link',
          label: 'Add payout details',
          url: `${getServerSideURL()}/account/payouts`,
        },
        {
          kind: 'paragraph',
          text: 'We never ask for bank details by email, and we never send them. Do not reply to this email with them. If an email asking for them seems to come from us, it is not from us: please tell us.',
        },
      ],
      footer: await emailFooter(payload),
    }),
  )

/**
 * After payout details are added or changed. Says only that it happened: never the details.
 * The link lets the real owner stop it if it was not them.
 */
export const sendBankChangeNotice = async (
  payload: Payload,
  { member, cancelToken, first }: { member: Member; cancelToken: string; first?: boolean },
): Promise<boolean> =>
  send(
    payload,
    member.email,
    buildEmail({
      subject: first ? 'Payout details added to your account' : 'Your bank details were changed',
      preheader: first
        ? 'If this was not you, stop it now.'
        : 'If this was not you, stop the change now.',
      parts: [
        {
          kind: 'paragraph',
          text: first
            ? 'Someone signed in to your PJK account and added the bank account we will pay you into. We will check it, with a ₹1 test payment, before we use it.'
            : 'Someone signed in to your PJK account and asked to change the bank account we pay you into. We will check the new details before using them; until then, the old ones stay as they are.',
        },
        { kind: 'paragraph', text: 'If this was you, there is nothing to do.' },
        {
          kind: 'paragraph',
          text: 'If it was not you, stop the change now. We will sign everyone out of your account, and you should then tell us at once.',
        },
        {
          kind: 'link',
          label: 'This was not me',
          url: `${getServerSideURL()}/account/bank-change/cancel?t=${encodeURIComponent(cancelToken)}`,
        },
      ],
      footer: await emailFooter(payload),
    }),
  )

/** Where staff notices go: the technical inbox, else the business one, else the contact inbox */
const staffInbox = async (payload: Payload): Promise<string | undefined> => {
  const settings = (
    await payload.find({
      collection: 'site-settings',
      where: { 'tenant.slug': { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]
  return (
    settings?.technicalEmail ||
    settings?.businessEmail ||
    settings?.email ||
    process.env.CONTACT_INBOX ||
    undefined
  )
}

/** Staff are told a change of bank details is waiting, or was stopped; nothing more */
export const notifyStaffOfBankChange = async (
  payload: Payload,
  {
    reference,
    cancelled,
    first,
  }: { reference?: string | null; cancelled?: boolean; first?: boolean },
): Promise<boolean> => {
  const to = await staffInbox(payload)
  if (!to) return false
  return send(
    payload,
    to,
    buildEmail({
      subject: cancelled
        ? `Bank change stopped by the member: ${reference ?? ''}`
        : first
          ? `Payout details waiting: ${reference ?? ''}`
          : `Bank details change waiting: ${reference ?? ''}`,
      preheader: cancelled
        ? 'They said it was not them. Their sessions have been ended.'
        : 'Check the new details before approving them.',
      parts: [
        {
          kind: 'paragraph',
          text: cancelled
            ? `The member behind ${reference ?? 'this account'} said they did not ask to change their bank details. The change has been stopped and every session on the account ended. Please contact them.`
            : `A member (${reference ?? 'see the admin'}) has ${first ? 'added payout details' : 'asked to change their bank details'}. Send ₹1 to the account and ask them to confirm it arrived, then approve the details in the KYC record.`,
        },
      ],
      footer: await emailFooter(payload),
    }),
  )
}

/**
 * Staff are told a member has asked something about their data: a copy, deletion, or withdrawing
 * consent. Only the kind and the member's reference; staff look the rest up in the admin.
 */
export const notifyStaffOfDataRequest = async (
  payload: Payload,
  { reference, request }: { reference?: string | null; request: string },
): Promise<boolean> => {
  const to = await staffInbox(payload)
  if (!to) return false
  return send(
    payload,
    to,
    buildEmail({
      subject: `Data request: ${reference ?? 'a member'}`,
      preheader: 'The law gives us a limited time to answer it.',
      parts: [
        {
          kind: 'paragraph',
          text: `A member (${reference ?? 'see Security events in the admin'}) has asked: ${request}. Please deal with it as docs/KYC.md describes, and write to them when it is done.`,
        },
      ],
      footer: await emailFooter(payload),
    }),
  )
}

/**
 * Tells someone their account has been deleted: their details erased, and what, if anything, the
 * law makes us keep. Sent to the address they had, after the erasure has gone through
 */
export const sendAccountErased = async (
  payload: Payload,
  { to, kept }: { to: string; kept?: string | null },
): Promise<boolean> =>
  send(
    payload,
    to,
    buildEmail({
      subject: 'Your PJK account has been deleted',
      preheader: 'Your details have been erased.',
      parts: [
        {
          kind: 'paragraph',
          text: 'Your PAT and J.K. Co. account has been deleted, and the personal details on it erased: your name, contact details, address, profile, pictures and sign-in sessions. You can no longer sign in with this address.',
        },
        ...(kept
          ? [
              {
                kind: 'paragraph' as const,
                text: `The law requires us to keep a little for a while: ${kept} It is kept encrypted, used for nothing else, and deleted when that time is up.`,
              },
            ]
          : []),
        {
          kind: 'note',
          text: 'If you did not expect this, reply to this email and we will look into it.',
        },
      ],
      footer: await emailFooter(payload),
    }),
  )

/** Tells the old address that the account's email changed, with a way to report it */
export const sendEmailChangedNotice = async (
  payload: Payload,
  { oldEmail }: { oldEmail: string },
): Promise<boolean> =>
  send(
    payload,
    oldEmail,
    buildEmail({
      subject: 'The email address on your PJK account has changed',
      preheader: 'If this was you, there is nothing to do.',
      parts: [
        {
          kind: 'paragraph',
          text: 'The email address on your PAT and J.K. Co. account has just been changed, and confirmed with a code sent to the new address. Codes to sign in will go there from now on.',
        },
        {
          kind: 'note',
          text: 'If this was not you, reply to this email or write to us straight away, and we will put it right.',
        },
      ],
      footer: await emailFooter(payload),
    }),
  )

/**
 * Both addresses hear when our team changes the address on an account, at the member's request
 * after an identity check: the old one so a change they did not ask for is noticed, the new one
 * so they know it worked
 */
export const sendStaffEmailChangeNotices = async (
  payload: Payload,
  { oldEmail, newEmail }: { oldEmail: string; newEmail: string },
): Promise<void> => {
  const footer = await emailFooter(payload)
  await send(
    payload,
    oldEmail,
    buildEmail({
      subject: 'The email address on your PJK account has changed',
      preheader: 'Our team changed it at your request.',
      parts: [
        {
          kind: 'paragraph',
          text: 'Our team has changed the email address on your PAT and J.K. Co. account, after checking your identity, because you told us you could no longer use this one. Codes to sign in will go to the new address from now on, and every device signed in to your account has been signed out.',
        },
        {
          kind: 'note',
          text: 'If you did not ask for this, write to us at hello@pjk.co.in straight away, and we will put it right.',
        },
      ],
      footer,
    }),
  )
  await send(
    payload,
    newEmail,
    buildEmail({
      subject: 'Your PJK account now uses this email address',
      preheader: 'Sign in with a code sent here.',
      parts: [
        {
          kind: 'paragraph',
          text: 'At your request, and after checking your identity, our team has made this the email address for your PAT and J.K. Co. account. Sign in with a code sent here.',
        },
        { kind: 'link', label: 'Sign in', url: `${getServerSideURL()}/collaborate/signin` },
        {
          kind: 'note',
          text: 'If you did not ask for this, write to us at hello@pjk.co.in.',
        },
      ],
      footer,
    }),
  )
}

/** The member hears what staff decided about their profile */
export const sendReviewDecision = async (
  payload: Payload,
  {
    to,
    what,
    approved,
    note,
  }: { to: string; what: string; approved: boolean; note?: string | null },
): Promise<boolean> =>
  send(
    payload,
    to,
    buildEmail({
      subject: approved ? `${what} is now public` : `A few changes to ${what.toLowerCase()}`,
      preheader: approved
        ? 'Thank you. It can now be seen through Phulhaar.'
        : 'We have asked for a few changes before it goes up.',
      parts: [
        {
          kind: 'paragraph',
          text: approved
            ? `${what} has been approved and can now be seen through Phulhaar.`
            : `We have looked at ${what.toLowerCase()} and asked for a few changes before it goes up.`,
        },
        ...(note ? [{ kind: 'paragraph' as const, text: note }] : []),
        {
          kind: 'link',
          label: 'Your account',
          url: `${getServerSideURL()}/account`,
        },
      ],
      footer: await emailFooter(payload),
    }),
  )

/** Tells staff an artist has given or changed their Google Drive works folder */
export const notifyStaffOfWorksFolder = async (
  payload: Payload,
  { memberId, adminPath }: { memberId: string; adminPath: string },
): Promise<boolean> => {
  const to = await staffInbox(payload)
  if (!to) return false
  return send(
    payload,
    to,
    buildEmail({
      subject: `Works folder from ${memberId}`,
      preheader: `${memberId} has given the Google Drive folder their works are in.`,
      parts: [
        {
          kind: 'paragraph',
          text: `${memberId} has given or changed the Google Drive folder their works are in. Each work is in a folder named after it, with its photos, any video and its description.`,
        },
        {
          kind: 'link',
          label: 'Open the artist in the admin',
          url: `${getServerSideURL()}${adminPath}`,
        },
      ],
      footer: await emailFooter(payload),
    }),
  )
}

/** Staff hear that something is waiting for review; no details beyond what and whose */
export const notifyStaffOfReview = async (
  payload: Payload,
  { what, memberId, adminPath }: { what: string; memberId: string; adminPath: string },
): Promise<boolean> => {
  const to = await staffInbox(payload)
  if (!to) return false
  return send(
    payload,
    to,
    buildEmail({
      subject: `Waiting for review: ${what}`,
      preheader: `From ${memberId}.`,
      parts: [
        { kind: 'paragraph', text: `${memberId} has sent ${what.toLowerCase()} for review.` },
        { kind: 'link', label: 'Review it', url: `${getServerSideURL()}${adminPath}` },
      ],
      footer: await emailFooter(payload),
    }),
  )
}
