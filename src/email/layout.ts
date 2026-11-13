import type { EmailFooter } from './footer'

/**
 * The one template every automated email uses, as the founder set it out on 13 November 2026: a
 * white card on warm ivory with a green rule along its top, the PJK logo and the company's name in
 * the header, then the message, then a footer with the automated-sender notice, the logo again,
 * the registered office, the social accounts, a confidentiality notice naming who the email is for,
 * and the privacy policy. Georgia throughout, since mail clients do not load web fonts. Tables and
 * inline styles only, because that is what email clients reliably render.
 *
 * Every message is built twice, as HTML and as plain text, from the same parts. All text is
 * escaped; nothing the sender typed can turn into markup.
 */

const INK = '#16201a'
const GREEN = '#0f2a18'
const MUTED = '#5f6660'
const FAINT = '#858b86'
const PAPER = '#f6f3ec'
const PANEL = '#faf8f4'
const RULE = '#d9d4c7'
const HAIRLINE = '#eae6dc'
const SERIF = "Georgia,'Times New Roman',serif"

/** The registered trade name, as it is written in every email */
export const BRAND = 'PAT & J.K. Co.'

/** Where anyone who gets an automated email is asked to write */
export const HELLO_INBOX = 'hello@pjk.co.in'

/**
 * Images and links point at the live site rather than a preview (which sits behind a login, so an
 * image would not load in an inbox).
 */
const SITE = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://pjk.co.in').replace(/\/$/, '')
const LOGO_URL = `${SITE}/brand/pjk-logo-email.png`
const PRIVACY_URL = `${SITE}/privacy`
/** The Help Center, at the far right of the social row (the founder, 13 November 2026) */
export const HELP_CENTER_URL = `${SITE}/help`

/** The platform marks, drawn by `pnpm social:icons`; 18 x 18 shown */
const socialIconUrl = (platform: string) => `${SITE}/brand/social/${platform}.png`

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Escapes text, then makes every email address in it a mailto link */
const withMailtos = (text: string, color: string) =>
  escapeHtml(text).replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    (address) =>
      `<a href="mailto:${address}" style="color:${color};text-decoration:underline">${address}</a>`,
  )

export type EmailPart =
  | { kind: 'paragraph'; text: string }
  /** The one-time code, in its box */
  | { kind: 'code'; code: string }
  /** A labelled callout: a reference, a member ID, or a note from the team */
  | { kind: 'reference'; label: string; value: string }
  /** The button; always a live page on the site */
  | { kind: 'link'; label: string; url: string }
  /** Labelled answers, one per row: what someone filled in on a form */
  | { kind: 'fields'; rows: { label: string; value: string }[] }
  /**
   * Markup that is already safe: only ever the form builder's message, whose values it escapes
   * itself (src/plugins/index.ts), or text built from escaped parts (src/help/emails.ts)
   */
  | { kind: 'html'; html: string; text: string }

/**
 * Who an email is for, named in its confidentiality notice: a person whose name we know, an
 * address we know nothing else about yet, or one of PJK's own inboxes.
 */
export type Recipient = { email: string; name?: string | null } | { inbox: string }

export const recipientIdentifier = (recipient: Recipient): string => {
  if ('inbox' in recipient) return `${BRAND} (${recipient.inbox})`
  const name = recipient.name?.trim()
  return name
    ? `${name} (${recipient.email})`
    : `the individual or entity associated with ${recipient.email}`
}

export type BuiltEmail = { subject: string; text: string; html: string }

const htmlPart = (part: EmailPart): string => {
  switch (part.kind) {
    case 'paragraph':
      return `<p style="margin:0 0 18px;font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK}">${withMailtos(part.text, GREEN)}</p>`
    case 'code':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td align="center" style="padding:22px 20px;background-color:${PAPER};border:1px solid ${RULE}">
<div style="font-family:${SERIF};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};margin-bottom:8px">Verification Code</div>
<div style="font-family:${SERIF};font-size:36px;letter-spacing:0.28em;color:${GREEN};font-weight:normal">${escapeHtml(part.code)}</div>
</td></tr></table>`
    case 'reference':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0"><tr><td style="padding:16px 20px;background-color:${PANEL};border-left:3px solid ${GREEN};border-top:1px solid ${HAIRLINE};border-right:1px solid ${HAIRLINE};border-bottom:1px solid ${HAIRLINE}">
<div style="font-family:${SERIF};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};margin-bottom:4px">${escapeHtml(part.label)}</div>
<div style="font-family:${SERIF};font-size:20px;letter-spacing:0.06em;color:${GREEN};line-height:1.5">${escapeHtml(part.value)}</div>
</td></tr></table>`
    case 'link':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0"><tr><td align="center" bgcolor="${GREEN}">
<a href="${escapeHtml(part.url)}" target="_blank" style="display:inline-block;padding:13px 26px;background-color:${GREEN};color:${PAPER};font-family:${SERIF};font-size:14px;letter-spacing:0.08em;text-decoration:none;border:1px solid ${GREEN}">${escapeHtml(part.label)}</a>
</td></tr></table>`
    case 'fields':
      return fieldsHtml(part.rows)
    case 'html':
      return `<div style="font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK}">${part.html}</div>`
  }
}

const fieldsHtml = (rows: { label: string; value: string }[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;border-top:1px solid ${HAIRLINE}">${rows
    .map(
      (r) =>
        `<tr><td valign="top" style="padding:10px 12px 10px 0;width:38%;border-bottom:1px solid ${HAIRLINE};font-family:${SERIF};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED}">${escapeHtml(r.label)}</td><td valign="top" style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-family:${SERIF};font-size:15px;line-height:1.55;color:${INK};word-break:break-word">${withMailtos(r.value || '—', GREEN).replace(/\n/g, '<br />')}</td></tr>`,
    )
    .join('')}</table>`

const textPart = (part: EmailPart): string => {
  switch (part.kind) {
    case 'paragraph':
      return part.text
    case 'code':
      return `Verification code:\n    ${part.code}`
    case 'reference':
      return `${part.label}: ${part.value}`
    case 'link':
      return `${part.label}: ${part.url}`
    case 'fields':
      return part.rows.map((r) => `${r.label}: ${r.value || '—'}`).join('\n')
    case 'html':
      return part.text
  }
}

const notice = (brand: string) =>
  `This is an automated operational communication sent from an unmonitored address by ${brand} Please do not reply directly to this email. To reach us, write to ${HELLO_INBOX} and quote your reference or member ID in any correspondence.`

const confidentiality = (who: string) =>
  `The content of this email is intended for ${who} to which it is addressed only. This email may contain confidential information. If you are not the person or entity to whom this message is addressed, be aware that any use, reproduction, or distribution of this message is strictly prohibited. If you received this in error, please contact the sender at ${HELLO_INBOX} and immediately delete this email and any attachments.`

const footerHtml = (footer: EmailFooter, brand: string, who: string) => {
  const year = new Date().getFullYear()
  const site = footer.siteUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const office = [
    ...footer.lines.map(escapeHtml),
    ...(footer.siteUrl && site
      ? [
          `<a href="${escapeHtml(footer.siteUrl)}" target="_blank" style="color:${GREEN};text-decoration:underline">${escapeHtml(site)}</a>`,
        ]
      : []),
  ]
  // The social marks on the left; the Help Center at the far right of the same row
  const socials = `<tr><td style="padding-top:16px;padding-bottom:20px;border-bottom:1px solid ${HAIRLINE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" valign="middle" style="font-family:${SERIF};font-size:13px;line-height:1.55;color:${MUTED}">
${footer.socials
  .map(
    (s, i, all) =>
      `<a href="${escapeHtml(s.url)}" target="_blank" style="color:${GREEN};text-decoration:none;white-space:nowrap;${i < all.length - 1 ? 'margin-right:18px' : ''}">${
        s.icon
          ? `<img src="${socialIconUrl(s.platform)}" width="18" height="18" alt="" style="display:inline-block;border:0;vertical-align:middle;width:18px;height:18px" />&nbsp;`
          : ''
      }<span style="vertical-align:middle">${escapeHtml(s.label)}</span></a>`,
  )
  .join('\n')}
</td>
<td align="right" valign="middle" style="font-family:${SERIF};font-size:13px;line-height:1.55;color:${FAINT};white-space:nowrap"><a href="${HELP_CENTER_URL}" target="_blank" style="font-family:${SERIF};font-size:13px;line-height:1.55;color:${FAINT};text-decoration:none;white-space:nowrap">Help Center</a></td>
</tr></table>
</td></tr>`

  return `<tr><td style="padding:28px 40px 32px 40px;background-color:${PANEL};border-top:1px solid ${RULE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding-bottom:20px;border-bottom:1px solid ${HAIRLINE};font-family:${SERIF};font-size:12.5px;line-height:1.6;color:${MUTED}">This is an automated operational communication sent from an unmonitored address by <strong>${escapeHtml(brand)}</strong> Please do not reply directly to this email. To reach us, write to <a href="mailto:${HELLO_INBOX}" style="color:${GREEN};text-decoration:underline">${HELLO_INBOX}</a> and quote your reference or member ID in any correspondence.</td></tr>
<tr><td style="padding-top:22px">
<a href="${SITE}" target="_blank" style="text-decoration:none"><img src="${LOGO_URL}" width="110" height="53" alt="${escapeHtml(brand)}" style="display:block;border:0;outline:none;text-decoration:none;width:110px;height:auto;margin-bottom:12px" /></a>
<p style="margin:0;font-family:${SERIF};font-size:13px;line-height:1.55;color:${INK};font-weight:bold">${escapeHtml(brand)}</p>
${office.length ? `<p style="margin:2px 0 0 0;font-family:${SERIF};font-size:13px;line-height:1.55;color:${MUTED}">${office.join('<br />')}</p>` : ''}
</td></tr>
${socials}
<tr><td style="padding-top:16px;font-family:${SERIF};font-size:11.5px;line-height:1.55;color:${FAINT}">The content of this email is intended for <strong>${escapeHtml(who)}</strong> to which it is addressed only. This email may contain confidential information. If you are not the person or entity to whom this message is addressed, be aware that any use, reproduction, or distribution of this message is strictly prohibited. If you received this in error, please contact the sender at <a href="mailto:${HELLO_INBOX}" style="color:${MUTED};text-decoration:underline">${HELLO_INBOX}</a> and immediately delete this email and any attachments.</td></tr>
<tr><td style="padding-top:14px;font-family:${SERIF};font-size:11.5px;line-height:1.5;color:${FAINT}"><a href="${PRIVACY_URL}" target="_blank" style="color:${MUTED};text-decoration:underline">Privacy Policy &amp; Statutory Notice</a> &nbsp;&bull;&nbsp; &copy; ${year} ${escapeHtml(brand)} All rights reserved.</td></tr>
</table>
</td></tr>`
}

const footerText = (footer: EmailFooter, brand: string, who: string) =>
  [
    '—',
    notice(brand),
    [brand, ...footer.lines, footer.siteUrl].filter(Boolean).join('\n'),
    [...footer.socials.map((s) => `${s.label}: ${s.url}`), `Help Center: ${HELP_CENTER_URL}`].join(
      '\n',
    ),
    confidentiality(who),
    `Privacy Policy & Statutory Notice: ${PRIVACY_URL}\n© ${new Date().getFullYear()} ${brand} All rights reserved.`,
  ]
    .filter(Boolean)
    .join('\n\n')

export const buildEmail = ({
  subject,
  preheader,
  parts,
  footer,
  recipient,
  brand = BRAND,
}: {
  subject: string
  /** The line inbox previews show beside the subject */
  preheader: string
  parts: EmailPart[]
  footer: EmailFooter
  /** Who it is for, named in the confidentiality notice */
  recipient: Recipient
  brand?: string
}): BuiltEmail => {
  const who = recipientIdentifier(recipient)
  const html = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};-webkit-font-smoothing:antialiased">
<span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAPER}"><tr><td align="center" style="padding:44px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid ${RULE};border-top:4px solid ${GREEN}">
<tr><td style="padding:32px 40px 24px 40px;border-bottom:1px solid ${HAIRLINE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" valign="middle"><a href="${SITE}" target="_blank" style="text-decoration:none"><img src="${LOGO_URL}" width="156" height="75" alt="${escapeHtml(brand)}" style="display:block;border:0;outline:none;text-decoration:none;width:156px;height:auto;max-width:100%" /></a></td>
<td align="right" valign="middle" style="font-family:${SERIF};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED}">${escapeHtml(brand)}</td>
</tr></table>
</td></tr>
<tr><td style="padding:36px 40px 36px 40px;font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK}">
${parts.map(htmlPart).join('\n')}
</td></tr>
${footerHtml(footer, brand, who)}
</table>
</td></tr></table>
</body>
</html>`

  const text = [...parts.map(textPart), footerText(footer, brand, who)].join('\n\n')
  return { subject, text, html }
}
