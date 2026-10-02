import type { Payload } from 'payload'

import { buildEmail, type BuiltEmail } from '@/email/layout'
import { emailFooter } from '@/email/footer'
import type { Application, Member } from '@/payload-types'
import { canSendEmail } from '@/security/email'
import { OTP_TTL_MINUTES } from '@/security/constants'
import type { Purpose } from '@/security/challenges'
import { getServerSideURL } from '@/utilities/getURL'

import type { Decision } from './decide'

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
  { decision, application }: { decision: Decision; application: Application; member?: Member },
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

  return buildEmail({
    subject: 'Your application to PAT and J.K. Co.',
    preheader: `About your application ${application.reference}.`,
    parts: [
      {
        kind: 'paragraph',
        text: 'Thank you for applying, and for the time you gave it. We are not able to take your application further at present.',
      },
      { kind: 'paragraph', text: note },
      { kind: 'reference', label: 'Application reference', value: application.reference },
    ],
    footer,
  })
}

export const sendDecisionEmail = async (
  payload: Payload,
  args: { decision: Decision; application: Application; member: Member },
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
