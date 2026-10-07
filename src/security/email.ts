import type { Payload } from 'payload'

import { emailFooter } from '@/email/footer'
import { buildEmail } from '@/email/layout'

import { OTP_TTL_MINUTES } from './constants'

const isProduction = process.env.NODE_ENV === 'production'

/** True when an email adapter is configured (Resend). Without one, codes cannot be delivered. */
export const canSendEmail = (payload: Payload): boolean =>
  Boolean(process.env.RESEND_API_KEY) && Boolean(payload.email)

/**
 * Sends a sign-in code. In development, where no email service is configured, the code is
 * printed to the terminal instead so the flow can be tested locally. In production this
 * never happens: without an email service the request fails rather than silently letting
 * someone in.
 */
export const sendSignInCode = async (
  payload: Payload,
  { email, code }: { email: string; code: string },
): Promise<boolean> => {
  const subject = 'Your PJK admin sign-in code'

  if (!canSendEmail(payload)) {
    if (isProduction) {
      payload.logger.error('No email service configured — refusing to issue an admin sign-in code')
      return false
    }
    payload.logger.info(`[dev] Sign-in code for ${email}: ${code}`)
    return true
  }

  try {
    // The same letterhead as every member email, logo included
    const email_ = buildEmail({
      subject,
      preheader: `It expires in ${OTP_TTL_MINUTES} minutes.`,
      parts: [
        { kind: 'paragraph', text: 'Your sign-in code is' },
        { kind: 'code', code },
        {
          kind: 'paragraph',
          text: `It expires in ${OTP_TTL_MINUTES} minutes and can be used once. If you did not try to sign in to the PAT and J.K. Co. admin panel, ignore this email and tell the team.`,
        },
      ],
      footer: await emailFooter(payload),
    })
    await payload.sendEmail({ to: email, subject, text: email_.text, html: email_.html })
    return true
  } catch (error) {
    payload.logger.error({ err: error, msg: 'Could not send the sign-in code' })
    return false
  }
}

/** Tells the super admins that someone has asked for access. */
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
    const footer = await emailFooter(payload)
    await payload.sendEmail({
      to,
      subject: `Admin access requested by ${email}`,
      text:
        [
          `${name || 'Someone'} (${email}) has asked for access to the PJK admin panel.`,
          message ? `\nTheir message:\n${message}` : '',
          '\nApprove or decline it under Administration → Access requests.',
        ].join('\n') + footer.text,
    })
  } catch (error) {
    payload.logger.error({ err: error, msg: 'Could not notify admins of an access request' })
  }
}
