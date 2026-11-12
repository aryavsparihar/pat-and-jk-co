import type { Payload } from 'payload'

import { emailFooter } from '@/email/footer'
import { BRAND, buildEmail } from '@/email/layout'
import { getServerSideURL } from '@/utilities/getURL'

import { OTP_TTL_MINUTES } from './constants'

const isProduction = process.env.NODE_ENV === 'production'

/** True when an email adapter is configured (Resend). Without one, codes cannot be delivered. */
export const canSendEmail = (payload: Payload): boolean =>
  Boolean(process.env.RESEND_API_KEY) && Boolean(payload.email)

/**
 * 34. Sends an admin sign-in code. In development, where no email service is configured, the code
 * is printed to the terminal instead so the flow can be tested locally. In production this never
 * happens: without an email service the request fails rather than silently letting someone in.
 */
export const sendSignInCode = async (
  payload: Payload,
  { email, code }: { email: string; code: string },
): Promise<boolean> => {
  if (!canSendEmail(payload)) {
    if (isProduction) {
      payload.logger.error('No email service configured — refusing to issue an admin sign-in code')
      return false
    }
    payload.logger.info(`[dev] Sign-in code for ${email}: ${code}`)
    return true
  }
  const { deliver, TECH_INBOX } = await import('@/email/send')
  return deliver(
    payload,
    { to: email },
    buildEmail({
      subject: `Your ${BRAND} admin sign-in code`,
      preheader: `Your admin sign-in code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Please use the verification code below to sign in to the ${BRAND} administration panel:`,
        },
        { kind: 'code', code },
        {
          kind: 'paragraph',
          text: `This code expires in ${OTP_TTL_MINUTES} minutes and can be used once. If you did not attempt to sign in to the ${BRAND} admin panel, disregard this email and alert ${TECH_INBOX} immediately.`,
        },
      ],
      footer: await emailFooter(payload),
      recipient: { email, name: await staffName(payload, email) },
    }),
  )
}

/** A member of staff's name, for the confidentiality notice */
const staffName = async (payload: Payload, email: string): Promise<string | null> => {
  const found = await payload
    .find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  return found?.docs[0]?.name ?? null
}

/** 35. Tells the super admins that someone has asked for access. */
export const notifyAccessRequest = async (
  payload: Payload,
  { email, name, message }: { email: string; name?: string; message?: string },
): Promise<void> => {
  try {
    const admins = await payload.find({
      collection: 'users',
      where: { and: [{ roles: { contains: 'super-admin' } }, { status: { equals: 'active' } }] },
      limit: 10,
      overrideAccess: true,
    })
    const to = admins.docs.map((admin) => admin.email).filter(Boolean)
    if (to.length === 0 || !canSendEmail(payload)) {
      payload.logger.info(`[access request] ${name || ''} <${email}>: ${message || ''}`)
      return
    }
    const { deliver } = await import('@/email/send')
    const who = name ? `${name} (${email})` : email
    const footer = await emailFooter(payload)
    const subject = `Admin access requested by ${email}`
    // Each super admin gets their own copy, so the notice names them
    for (const admin of admins.docs) {
      await deliver(
        payload,
        { to: admin.email },
        buildEmail({
          subject,
          preheader: `${who} has requested access to the PJK admin panel.`,
          parts: [
            {
              kind: 'paragraph',
              text: `${who} has requested access to the ${BRAND} administration panel.`,
            },
            ...(message?.trim()
              ? [{ kind: 'reference' as const, label: 'Requester Message', value: message.trim() }]
              : []),
            {
              kind: 'paragraph',
              text: 'Please approve or decline this request in the admin panel under Administration → Access requests.',
            },
            {
              kind: 'link',
              label: 'Review access requests',
              url: `${getServerSideURL()}/admin/collections/access-requests`,
            },
          ],
          footer,
          recipient: { email: admin.email, name: admin.name },
        }),
      )
    }
  } catch (error) {
    payload.logger.error({ err: error, msg: 'Could not notify admins of an access request' })
  }
}

/**
 * 36. Tells a member of staff that their account has been locked after too many wrong passwords,
 * with tech@ and business@ copied, so a guessing attempt does not go unnoticed. Never says what
 * was tried.
 */
export const notifyStaffLockout = async (
  payload: Payload,
  { email, minutes }: { email: string; minutes: number },
): Promise<void> => {
  const subject = `Your ${BRAND} admin account was locked`
  if (!canSendEmail(payload)) {
    payload.logger.info(`[dev] Email "${subject}" to ${email}`)
    return
  }
  const { deliver, BUSINESS_INBOX, TECH_INBOX } = await import('@/email/send')
  await deliver(
    payload,
    { to: email, cc: [TECH_INBOX, BUSINESS_INBOX] },
    buildEmail({
      subject,
      preheader: `Locked for ${minutes} minutes after five unsuccessful password attempts.`,
      parts: [
        {
          kind: 'paragraph',
          text: `Your ${BRAND} administration account has been locked for ${minutes} minutes following five consecutive unsuccessful password attempts.`,
        },
        {
          kind: 'paragraph',
          text: `If this was you, please wait ${minutes} minutes and try again, or reset your password using "Forgot password" after entering your sign-in code.`,
        },
        {
          kind: 'paragraph',
          text: `If this was not you, someone may be attempting to guess your password. Please notify ${TECH_INBOX} immediately and change your password as soon as the lockout expires.`,
        },
      ],
      footer: await emailFooter(payload),
      recipient: { email, name: await staffName(payload, email) },
    }),
  )
}
