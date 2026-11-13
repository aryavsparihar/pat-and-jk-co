import { escapeHtml } from '@/email/layout'
import { isEmail, normaliseEmail } from '@/security/constants'

/**
 * A Help Center request (pjk.co.in/help), as the founder set it out on 13 November 2026: who is
 * asking, what kind of request it is, how to reach them, the device and browser for a technical
 * problem, the details (bold, italic and links only) and any screenshots, pictures or PDFs.
 *
 * Nothing here is stored. The request travels in two emails, to PJK and back to the sender, and
 * only the ticket number and the kind of request are kept (src/collections/HelpTickets.ts).
 */

export const REQUEST_TYPES = {
  artist: { label: 'I am an Artist', idLabel: 'Artist ID' },
  partner: { label: 'I am a Trade Partner', idLabel: 'Trade Partner ID' },
} as const
export type RequestType = keyof typeof REQUEST_TYPES

export const NATURES = {
  technical: 'Technical Issue / Inquiry',
  business: 'Business Inquiry',
} as const
export type Nature = keyof typeof NATURES

/** Vercel refuses a request body over 4.5 MB, so the files together stay under 4 MB */
export const ATTACHMENTS_MAX_BYTES = 4 * 1024 * 1024
export const ATTACHMENTS_MAX_COUNT = 5
export const DETAILS_MAX_CHARS = 10_000
const SHORT_MAX = 120
const SUBJECT_MAX = 200

/** One stretch of the details text, with its formatting */
export type Run = { t: string; b?: boolean; i?: boolean; h?: string }
/** The details: paragraphs, each a list of runs */
export type Details = Run[][]

export type Attachment = { filename: string; content: Buffer; contentType: string }

export type HelpRequest = {
  requestType: RequestType
  nature: Nature
  email: string
  memberCode: string
  name: string
  device: string
  browser: string
  clearedCache: boolean
  subject: string
  details: Details
  attachments: Attachment[]
}

export type Parsed = { ok: true; request: HelpRequest } | { ok: false; message: string }

const text = (value: FormDataEntryValue | null, max: number): string =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

/** Only web and email links: never javascript:, data: or anything else a mail client might run */
export const safeHref = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 2000) return null
  const trimmed = value.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * The details as the browser's editor sent them: JSON paragraphs of runs. Anything that is not
 * plain text, bold, italic or a web link is dropped, so no HTML from the sender ever reaches an
 * inbox: the emails are built from these runs, escaped.
 */
export const parseDetails = (raw: unknown): Details | null => {
  if (typeof raw !== 'string' || raw.length > DETAILS_MAX_CHARS * 4) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(data)) return null
  const paragraphs: Details = []
  let length = 0
  for (const paragraph of data.slice(0, 500)) {
    if (!Array.isArray(paragraph)) return null
    const runs: Run[] = []
    for (const run of paragraph.slice(0, 500)) {
      if (!run || typeof run !== 'object') return null
      const r = run as Record<string, unknown>
      if (typeof r.t !== 'string') return null
      const t = r.t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n/g, ' ')
      if (!t) continue
      length += t.length
      const href = r.h === undefined ? null : safeHref(r.h)
      runs.push({
        t,
        ...(r.b === true ? { b: true } : {}),
        ...(r.i === true ? { i: true } : {}),
        ...(href ? { h: href } : {}),
      })
    }
    paragraphs.push(runs)
  }
  // Blank lines at either end are not part of the message
  while (paragraphs.length && !paragraphs[0].some((r) => r.t.trim())) paragraphs.shift()
  while (paragraphs.length && !paragraphs.at(-1)!.some((r) => r.t.trim())) paragraphs.pop()
  if (length > DETAILS_MAX_CHARS) return null
  return paragraphs
}

export const detailsLength = (details: Details): number =>
  details.reduce((sum, p) => sum + p.reduce((s, r) => s + r.t.trim().length, 0), 0)

/** The details for an email, every character escaped */
export const detailsHtml = (details: Details, linkColour: string): string =>
  details
    .map((paragraph) => {
      const inner = paragraph
        .map((run) => {
          let html = escapeHtml(run.t)
          if (run.b) html = `<strong>${html}</strong>`
          if (run.i) html = `<em>${html}</em>`
          if (run.h)
            html = `<a href="${escapeHtml(run.h)}" target="_blank" style="color:${linkColour};text-decoration:underline">${html}</a>`
          return html
        })
        .join('')
      return `<p style="margin:0 0 12px 0">${inner || '&nbsp;'}</p>`
    })
    .join('\n')

/** The details as plain text: a link becomes "words (address)" */
export const detailsText = (details: Details): string =>
  details
    .map((paragraph) =>
      paragraph
        .map((run) => (run.h && run.h !== run.t.trim() ? `${run.t} (${run.h})` : run.t))
        .join(''),
    )
    .join('\n\n')

/** What the bytes say a file is: only pictures and PDFs are taken, whatever the name claims */
export const sniffAttachment = (bytes: Buffer): { type: string; ext: string } | null => {
  const head = bytes.subarray(0, 16)
  const ascii = head.toString('latin1')
  if (ascii.startsWith('%PDF-')) return { type: 'application/pdf', ext: 'pdf' }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return { type: 'image/jpeg', ext: 'jpg' }
  if (ascii.startsWith('\x89PNG\r\n\x1a\n')) return { type: 'image/png', ext: 'png' }
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a'))
    return { type: 'image/gif', ext: 'gif' }
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
    return { type: 'image/webp', ext: 'webp' }
  if (ascii.slice(4, 8) === 'ftyp' && /^(heic|heix|mif1|msf1|heis|hevc)$/.test(ascii.slice(8, 12)))
    return { type: 'image/heic', ext: 'heic' }
  return null
}

/** A file name safe to show and attach: no folders, no control characters, the right extension */
export const attachmentName = (name: string, ext: string, index: number): string => {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>:|?*]+/g, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 80)
  return `${base || `attachment-${index + 1}`}.${ext}`
}

const isRequestType = (v: unknown): v is RequestType => v === 'artist' || v === 'partner'
const isNature = (v: unknown): v is Nature => v === 'technical' || v === 'business'

/** Reads and checks the form. Every message is one a person can act on */
export const parseHelpRequest = async (form: FormData): Promise<Parsed> => {
  const requestType = form.get('requestType')
  const nature = form.get('nature')
  if (!isRequestType(requestType)) return { ok: false, message: 'Choose who you are.' }
  if (!isNature(nature)) return { ok: false, message: 'Choose the nature of your request.' }

  const email = normaliseEmail(form.get('email'))
  if (!isEmail(email)) return { ok: false, message: 'Enter your email address.' }
  const memberCode = text(form.get('memberCode'), 40).toUpperCase()
  if (!memberCode)
    return { ok: false, message: `Enter your ${REQUEST_TYPES[requestType].idLabel}.` }
  const name = text(form.get('name'), SHORT_MAX)
  if (!name) return { ok: false, message: 'Enter your full name.' }

  const details = parseDetails(form.get('details'))
  if (!details) return { ok: false, message: 'Your request could not be read. Please try again.' }
  if (detailsLength(details) === 0) return { ok: false, message: 'Describe your request.' }

  const files = form.getAll('attachments').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > ATTACHMENTS_MAX_COUNT)
    return { ok: false, message: `Attach up to ${ATTACHMENTS_MAX_COUNT} files.` }
  if (files.reduce((sum, f) => sum + f.size, 0) > ATTACHMENTS_MAX_BYTES)
    return { ok: false, message: 'The attachments come to more than 4 MB together.' }
  const attachments: Attachment[] = []
  for (const [index, file] of files.entries()) {
    const content = Buffer.from(await file.arrayBuffer())
    const kind = sniffAttachment(content)
    if (!kind)
      return {
        ok: false,
        message: `"${attachmentName(file.name, 'file', index).replace(/\.file$/, '')}" is not a picture or a PDF.`,
      }
    attachments.push({
      filename: attachmentName(file.name, kind.ext, index),
      content,
      contentType: kind.type,
    })
  }

  return {
    ok: true,
    request: {
      requestType,
      nature,
      email,
      memberCode,
      name,
      device: text(form.get('device'), SHORT_MAX),
      browser: text(form.get('browser'), SHORT_MAX),
      clearedCache: form.get('clearedCache') === 'yes',
      subject: text(form.get('subject'), SUBJECT_MAX),
      details,
      attachments,
    },
  }
}
