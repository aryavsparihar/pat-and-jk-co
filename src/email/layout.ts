import type { EmailFooter } from './footer'

/**
 * The look of every member email: the site's letterhead in miniature. Ink on warm ivory, a
 * serif face (Georgia, since mail clients do not load web fonts), the PJK logo at the top (a PNG:
 * mail clients do not show SVG; the company's name stands in where images are blocked), the
 * registered office at the foot. Tables and inline styles only, because
 * that is what email clients reliably render.
 *
 * Every message is built twice, as HTML and as plain text, from the same parts. All text is
 * escaped; nothing the sender typed can turn into markup.
 */

const INK = '#16201a'
const GREEN = '#0f2a18'
const MUTED = '#5f6660'
const PAPER = '#f6f3ec'
const RULE = '#d9d4c7'
const SERIF = "Georgia,'Times New Roman',serif"

/**
 * The logo, from the live site rather than a preview (which sits behind a login, so the image
 * would not load in an inbox). 180 x 87 shown; the file is twice that for sharp screens.
 */
const SITE = (process.env.NEXT_PUBLIC_SERVER_URL || 'https://pjk.co.in').replace(/\/$/, '')
const LOGO_URL = `${SITE}/brand/pjk-logo-email.png`

/** The platform marks, drawn by `pnpm social:icons`; 24 x 24 shown */
const socialIconUrl = (platform: string) => `${SITE}/brand/social/${platform}.png`

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export type EmailPart =
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; code: string }
  | { kind: 'reference'; label: string; value: string }
  | { kind: 'link'; label: string; url: string }
  | { kind: 'note'; text: string }
  /** A sentence ending in an email address, which becomes a mailto link */
  | { kind: 'mailto'; text: string; email: string }
  /** A brand's social links, each with its platform's mark */
  | { kind: 'socials'; heading: string; links: { platform: string; label: string; url: string }[] }

export type BuiltEmail = { subject: string; text: string; html: string }

const htmlPart = (part: EmailPart): string => {
  switch (part.kind) {
    case 'paragraph':
      return `<p style="margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.6;color:${INK}">${escapeHtml(part.text)}</p>`
    case 'note':
      return `<p style="margin:0 0 18px;font-family:${SERIF};font-size:15px;line-height:1.6;color:${MUTED}">${escapeHtml(part.text)}</p>`
    case 'code':
      return `<p style="margin:8px 0 26px;font-family:${SERIF};font-size:38px;letter-spacing:0.28em;color:${GREEN}">${escapeHtml(part.code)}</p>`
    case 'reference':
      return `<p style="margin:0 0 22px;font-family:${SERIF};font-size:15px;line-height:1.5;color:${MUTED}">${escapeHtml(part.label)}<br /><span style="font-size:22px;letter-spacing:0.08em;color:${GREEN}">${escapeHtml(part.value)}</span></p>`
    case 'link':
      return `<p style="margin:4px 0 24px"><a href="${escapeHtml(part.url)}" style="display:inline-block;padding:12px 22px;background:${GREEN};color:${PAPER};font-family:${SERIF};font-size:15px;letter-spacing:0.08em;text-decoration:none">${escapeHtml(part.label)}</a></p>`
    case 'mailto':
      return `<p style="margin:0 0 18px;font-family:${SERIF};font-size:17px;line-height:1.6;color:${INK}">${escapeHtml(part.text)} <a href="mailto:${escapeHtml(part.email)}" style="color:${GREEN};text-decoration:underline">${escapeHtml(part.email)}</a>.</p>`
    case 'socials':
      if (!part.links.length) return ''
      return `<p style="margin:8px 0 10px;font-family:${SERIF};font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED}">${escapeHtml(part.heading)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>${part.links
        .map(
          (link) =>
            `<td style="padding:0 22px 0 0"><a href="${escapeHtml(link.url)}" style="font-family:${SERIF};font-size:15px;color:${GREEN};text-decoration:none"><img src="${socialIconUrl(escapeHtml(link.platform))}" width="24" height="24" alt="" style="display:inline-block;border:0;vertical-align:middle;width:24px;height:24px" />&nbsp;&nbsp;<span style="vertical-align:middle">${escapeHtml(link.label)}</span></a></td>`,
        )
        .join('')}</tr></table>`
  }
}

const textPart = (part: EmailPart): string => {
  switch (part.kind) {
    case 'paragraph':
    case 'note':
      return part.text
    case 'code':
      return `    ${part.code}`
    case 'reference':
      return `${part.label}: ${part.value}`
    case 'link':
      return `${part.label}: ${part.url}`
    case 'mailto':
      return `${part.text} ${part.email}.`
    case 'socials':
      return part.links.length
        ? [part.heading, ...part.links.map((link) => `${link.label}: ${link.url}`)].join('\n')
        : ''
  }
}

export const buildEmail = ({
  subject,
  preheader,
  parts,
  footer,
  brand = 'PAT and J.K. Co.',
}: {
  subject: string
  /** The line inbox previews show beside the subject */
  preheader: string
  parts: EmailPart[]
  footer: EmailFooter
  brand?: string
}): BuiltEmail => {
  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:40px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="left" style="padding:0 0 24px;border-bottom:1px solid ${RULE};font-family:${SERIF};font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:${GREEN}"><img src="${LOGO_URL}" width="180" height="87" alt="${escapeHtml(brand)}" style="display:block;border:0;outline:none;text-decoration:none;width:180px;height:auto;max-width:100%" /></td></tr>
<tr><td style="padding:32px 0 0">
${parts.map(htmlPart).join('\n')}
${footer.html}
</td></tr>
</table>
</td></tr></table>
</body></html>`

  const text = [...parts.map(textPart), footer.text].filter(Boolean).join('\n\n')
  return { subject, text, html }
}
