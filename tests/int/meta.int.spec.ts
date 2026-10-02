import { describe, expect, it } from 'vitest'

import { generateMeta } from '@/utilities/meta'

const ctx = {
  siteUrl: 'https://pjk.co.in',
  tenant: { id: 1, name: 'PJK', slug: 'pjk' },
  settings: { siteName: 'PAT and J.K. Co.', tagline: 'Art and craft' },
} as never

const titleOf = (doc: object, path = '/about') => generateMeta({ ctx, doc, path }).title

describe('page titles', () => {
  it('leave the site name to the layout when the page title does not have it', () => {
    expect(titleOf({ title: 'About' })).toBe('About')
  })

  it('are used as written when the SEO title already names the site', () => {
    expect(
      titleOf({ meta: { title: 'Our ventures in art and craft | PAT and J.K. Co.' } }),
    ).toEqual({
      absolute: 'Our ventures in art and craft | PAT and J.K. Co.',
    })
    expect(titleOf({ meta: { title: 'Visit pat and j.k. co. today' } })).toEqual({
      absolute: 'Visit pat and j.k. co. today',
    })
  })

  it('lose stray whitespace pasted into the admin', () => {
    expect(titleOf({ meta: { title: '\tAbout PJK —  The house  ' } })).toBe('About PJK — The house')
  })

  it('put the site name in the social preview exactly once', () => {
    const named = generateMeta({
      ctx,
      doc: { meta: { title: 'Ventures | PAT and J.K. Co.' } },
      path: '/ventures',
    })
    expect(named.openGraph?.title).toBe('Ventures | PAT and J.K. Co.')
    const plain = generateMeta({ ctx, doc: { title: 'Journal' }, path: '/journal' })
    expect(plain.openGraph?.title).toBe('Journal — PAT and J.K. Co.')
  })

  it('give the homepage the site name and tagline', () => {
    expect(titleOf({ title: 'Home' }, '/')).toEqual({
      absolute: 'PAT and J.K. Co. — Art and craft',
    })
  })
})
