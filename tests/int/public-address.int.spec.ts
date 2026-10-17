// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * One public address. A production build sends every *.vercel.app request on to pjk.co.in with a
 * permanent redirect that keeps the path, except Vercel's own cron calls; a preview build
 * redirects nothing (previews stay behind Vercel's login). Checked here against next.config.ts's rules, matched the way Next.js and
 * Vercel match them, and on the live site after each deployment (curl -I).
 */

type Condition = { type: string; key?: string; value?: string }
type Rule = {
  source: string
  has?: Condition[]
  missing?: Condition[]
  destination?: string
  permanent?: boolean
}
type Request = { host: string; userAgent?: string }

const load = async (vercelEnv?: string) => {
  vi.resetModules()
  if (vercelEnv) vi.stubEnv('VERCEL_ENV', vercelEnv)
  const { default: config } = await import('../../next.config')
  return {
    redirects: ((await config.redirects?.()) ?? []) as Rule[],
  }
}

// A has or missing value is a regular expression that must match the whole host or header
const matches = (pattern: string, value: string) => new RegExp(`^${pattern}$`).test(value)

const applies = (rule: Rule, request: Request) => {
  const actual = (c: Condition) =>
    c.type === 'host' ? request.host : c.key === 'user-agent' ? (request.userAgent ?? '') : ''
  return (
    (rule.has ?? []).every((c) => matches(c.value!, actual(c))) &&
    (rule.missing ?? []).every((c) => !matches(c.value!, actual(c)))
  )
}

const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the public address', () => {
  it('in production, sends every vercel.app address on to pjk.co.in, keeping the path', async () => {
    const { redirects } = await load('production')
    expect(redirects).toHaveLength(1)
    const [rule] = redirects
    expect(rule.source).toBe('/:path*')
    expect(rule.destination).toBe('https://pjk.co.in/:path*')
    // 308: permanent, and the method and body are kept
    expect(rule.permanent).toBe(true)
    for (const host of [
      'pat-and-jk-co.vercel.app',
      'pat-and-jk-co-aryavsparihars-projects.vercel.app',
      'pat-and-jk-6aglrbwpk-aryavsparihars-projects.vercel.app',
    ]) {
      expect(applies(rule, { host, userAgent: BROWSER }), host).toBe(true)
    }
    for (const host of ['pjk.co.in', 'www.pjk.co.in', 'vercel.app.example.com', 'localhost']) {
      expect(applies(rule, { host, userAgent: BROWSER }), host).toBe(false)
    }
  })

  it('leaves Vercel’s cron calls alone, so they keep their secret', async () => {
    const [rule] = (await load('production')).redirects
    expect(applies(rule, { host: 'pat-and-jk-co.vercel.app', userAgent: 'vercel-cron/1.0' })).toBe(
      false,
    )
  })

  it('redirects nothing in a preview build or on a developer’s machine', async () => {
    expect((await load('preview')).redirects).toEqual([])
    expect((await load()).redirects).toEqual([])
  })
})
