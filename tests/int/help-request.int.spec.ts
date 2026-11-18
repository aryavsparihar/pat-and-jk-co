// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { routeFor } from '@/help/emails'
import {
  detailsHtml,
  detailsText,
  parseDetails,
  parseHelpRequest,
  safeHref,
  sniffAttachment,
} from '@/help/request'
import { HELP_TICKET_PATTERN, newHelpTicket } from '@/members/ids'
import { MEMBER_PAGE } from '@/security/memberPagePolicy'

/*
 * The Help Center (pjk.co.in/help): ticket numbers, the routing the founder set out, and that
 * nothing the sender types reaches an inbox as markup.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const form = (fields: Record<string, string>, files: File[] = []) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  files.forEach((file) => data.append('attachments', file))
  return data
}

const valid = {
  requestType: 'partner',
  nature: 'business',
  email: 'Someone@Example.com',
  memberCode: ' pt-7k3q9 ',
  name: 'A Partner',
  details: JSON.stringify([[{ t: 'Hello' }]]),
}

describe('Help Center tickets', () => {
  it('are five characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) expect(newHelpTicket()).toMatch(HELP_TICKET_PATTERN)
    expect('7K3Q9').toMatch(HELP_TICKET_PATTERN)
    expect('7K3O9').not.toMatch(HELP_TICKET_PATTERN)
  })
})

describe('Help Center routing', () => {
  it('sends business to business@, technical to tech@ with business@ blind-copied', async () => {
    expect(await routeFor('business')).toEqual({ to: 'business@pjk.co.in', bcc: [] })
    expect(await routeFor('technical')).toEqual({
      to: 'tech@pjk.co.in',
      bcc: ['business@pjk.co.in'],
    })
  })

  it('gets the strict page policy', () => {
    expect(MEMBER_PAGE.test('/help')).toBe(true)
  })
})

describe('Help Center details', () => {
  it('keeps bold, italic and web links, and escapes everything', () => {
    const details = parseDetails(
      JSON.stringify([
        [
          { t: '<script>alert(1)</script> ', b: true },
          { t: 'here', h: 'javascript:alert(1)' },
          { t: ' there', i: true, h: 'example.com/a?b=<c>' },
        ],
      ]),
    )!
    expect(details[0][1]).toEqual({ t: 'here' })
    const html = detailsHtml(details, '#0f2a18')
    expect(html).not.toMatch(/<script|javascript:/)
    expect(html).toContain('<strong>&#60;script&#62;alert(1)&#60;/script&#62; </strong>')
    expect(html).toContain('href="https://example.com/a?b=%3Cc%3E"')
    expect(detailsText(details)).toContain(' there (https://example.com/a?b=%3Cc%3E)')
  })

  it('takes only web and email links', () => {
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co')
    expect(safeHref('data:text/html,hi')).toBeNull()
    expect(safeHref('vbscript:x')).toBeNull()
  })

  it('refuses anything but paragraphs of runs', () => {
    expect(parseDetails('<p>hi</p>')).toBeNull()
    expect(parseDetails(JSON.stringify({ t: 'hi' }))).toBeNull()
    expect(parseDetails(JSON.stringify([[{ t: 'x'.repeat(10_001) }]]))).toBeNull()
  })
})

describe('Help Center form', () => {
  it('reads a complete request', async () => {
    const parsed = await parseHelpRequest(form(valid))
    expect(parsed).toMatchObject({
      ok: true,
      request: { email: 'someone@example.com', memberCode: 'PT-7K3Q9', clearedCache: false },
    })
  })

  it('asks for each required field', async () => {
    for (const [field, message] of [
      ['requestType', 'Choose who you are.'],
      ['nature', 'Choose the nature of your request.'],
      ['email', 'Enter your email address.'],
      ['memberCode', 'Enter your Trade Partner ID.'],
      ['name', 'Enter your full name.'],
    ]) {
      const parsed = await parseHelpRequest(form({ ...valid, [field]: '' }))
      expect(parsed).toEqual({ ok: false, message })
    }
    const blank = await parseHelpRequest(form({ ...valid, details: '[[{"t":"  "}]]' }))
    expect(blank).toEqual({ ok: false, message: 'Describe your request.' })
  })

  it('takes pictures and PDFs by their bytes, not their names', async () => {
    expect(sniffAttachment(PNG)?.type).toBe('image/png')
    expect(sniffAttachment(Buffer.from('%PDF-1.7'))?.type).toBe('application/pdf')
    const disguised = new File([Buffer.from('MZ\x90\x00')], 'photo.png', { type: 'image/png' })
    expect(await parseHelpRequest(form(valid, [disguised]))).toEqual({
      ok: false,
      message: '"photo" is not a picture or a PDF.',
    })
    const named = await parseHelpRequest(
      form(valid, [new File([PNG], '../../etc/screen.exe', { type: 'image/png' })]),
    )
    expect(named.ok && named.request.attachments[0].filename).toBe('screen.png')
  })

  it('refuses files over 4 MB together', async () => {
    const big = new File([Buffer.alloc(4 * 1024 * 1024 + 1)], 'big.pdf')
    expect(await parseHelpRequest(form(valid, [big]))).toEqual({
      ok: false,
      message: 'The attachments come to more than 4 MB together.',
    })
  })
})
