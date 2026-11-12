// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { EmailFooter } from '@/email/footer'
import { buildEmail, recipientIdentifier } from '@/email/layout'

/*
 * The one email template, as the founder set it out on 13 November 2026: the registered trade
 * name throughout, the no-reply notice pointing to hello@, the three social marks alike, and a
 * confidentiality notice that always names who the email is for.
 */

const footer: EmailFooter = {
  text: '',
  html: '',
  lines: ['Ward No. 7, ITI Road', 'Kathua, Jammu and Kashmir 184101', 'India'],
  siteUrl: 'https://pjk.co.in',
  socials: [
    {
      platform: 'instagram',
      label: 'Instagram',
      url: 'https://www.instagram.com/pjk.co/',
      icon: true,
    },
    {
      platform: 'linkedin',
      label: 'LinkedIn',
      url: 'https://www.linkedin.com/company/1/',
      icon: true,
    },
    { platform: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/pjk.co', icon: true },
  ],
}

const build = (recipient: Parameters<typeof buildEmail>[0]['recipient']) =>
  buildEmail({
    subject: 'Your PAT & J.K. Co. sign-in code',
    preheader: 'Your sign-in code is 482913.',
    parts: [
      { kind: 'paragraph', text: 'Write to compliance@pjk.co.in at once.' },
      { kind: 'code', code: '482913' },
      { kind: 'reference', label: 'Your Artist ID', value: 'AT-7K3Q9' },
      { kind: 'link', label: 'Sign in', url: 'https://pjk.co.in/collaborate/signin' },
    ],
    footer,
    recipient,
  })

describe('the email template', () => {
  it('names who it is for, falling back to the address, or PJK’s own inbox', () => {
    expect(recipientIdentifier({ email: 'asha@example.com', name: 'Asha Example' })).toBe(
      'Asha Example (asha@example.com)',
    )
    expect(recipientIdentifier({ email: 'asha@example.com', name: '  ' })).toBe(
      'the individual or entity associated with asha@example.com',
    )
    expect(recipientIdentifier({ inbox: 'business@pjk.co.in' })).toBe(
      'PAT & J.K. Co. (business@pjk.co.in)',
    )
  })

  it('uses the registered trade name and never the old one or the proprietor’s', () => {
    const { html, text } = build({ email: 'asha@example.com' })
    for (const body of [html, text]) {
      expect(body).not.toContain('PAT and J.K. Co.')
      expect(body).not.toMatch(/Pathania|Prop\./)
    }
    expect(text).toContain('© ' + new Date().getFullYear() + ' PAT & J.K. Co. All rights reserved.')
    expect(html).toContain('the individual or entity associated with asha@example.com')
  })

  it('points replies to hello@ and shows the three social marks alike', () => {
    const { html } = build({ email: 'asha@example.com' })
    expect(html).toContain('sent from an unmonitored address')
    expect(html).toContain('href="mailto:hello@pjk.co.in"')
    for (const platform of ['instagram', 'linkedin', 'facebook'])
      expect(html).toContain(
        `<img src="https://pjk.co.in/brand/social/${platform}.png" width="18" height="18"`,
      )
    expect(html).toContain('href="https://pjk.co.in/privacy"')
  })

  it('makes addresses in the text into mail links, and the code, callout and button', () => {
    const { html, text } = build({ email: 'asha@example.com' })
    expect(html).toContain('<a href="mailto:compliance@pjk.co.in"')
    expect(html).toContain('Verification Code')
    expect(html).toContain('482913')
    expect(html).toContain('AT-7K3Q9')
    expect(html).toContain('href="https://pjk.co.in/collaborate/signin"')
    expect(text).toContain('Sign in: https://pjk.co.in/collaborate/signin')
  })
})
