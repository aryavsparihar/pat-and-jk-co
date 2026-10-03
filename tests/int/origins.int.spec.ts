import { describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { fromOurOrigin } from '@/members/http'
import { getServerSideURL, previewDeploymentURLs, trustedOrigins } from '@/utilities/getURL'

/*
 * Which origins may send cookie-authenticated requests (Payload's CSRF and CORS lists, and the
 * member endpoints). The Vercel URLs here are made up.
 */

const production = {
  VERCEL_ENV: 'production',
  NEXT_PUBLIC_SERVER_URL: 'https://pjk.co.in',
  VERCEL_URL: 'pat-and-jk-abc123-example.vercel.app',
  VERCEL_BRANCH_URL: 'pat-and-jk-co-git-main-example.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'pjk.co.in',
}

const preview = {
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SERVER_URL: 'https://pjk.co.in',
  VERCEL_URL: 'pat-and-jk-xyz789-example.vercel.app',
  VERCEL_BRANCH_URL: 'pat-and-jk-co-git-phase-5-kyc-example.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'pjk.co.in',
}

describe('trusted origins', () => {
  it('in production, trust only pjk.co.in, never a vercel.app address', () => {
    expect(getServerSideURL(production)).toBe('https://pjk.co.in')
    expect(previewDeploymentURLs(production)).toEqual([])
    expect(trustedOrigins(production)).toEqual(['https://pjk.co.in'])
    expect(trustedOrigins({ ...production, ALLOWED_ORIGINS: 'https://phulhaar.com/' })).toEqual([
      'https://pjk.co.in',
      'https://phulhaar.com',
    ])
  })

  it('on a preview, trust the deployment’s own URLs, and link to its branch URL', () => {
    expect(getServerSideURL(preview)).toBe(
      'https://pat-and-jk-co-git-phase-5-kyc-example.vercel.app',
    )
    expect(trustedOrigins(preview)).toEqual([
      'https://pat-and-jk-co-git-phase-5-kyc-example.vercel.app',
      'https://pat-and-jk-xyz789-example.vercel.app',
    ])
    expect(trustedOrigins(preview)).not.toContain('https://pjk.co.in')
  })

  it('on a preview without the branch URL, fall back to the deployment URL', () => {
    const { VERCEL_BRANCH_URL: _, ...bare } = preview
    expect(getServerSideURL(bare)).toBe('https://pat-and-jk-xyz789-example.vercel.app')
  })

  it('locally, stay on the configured URL or localhost', () => {
    expect(trustedOrigins({ VERCEL_URL: 'something.vercel.app' })).toEqual([
      'http://localhost:3000',
    ])
  })
})

describe('Payload’s CSRF and CORS lists', () => {
  it('are the same trusted origins', async () => {
    const sanitized = await config
    expect(sanitized.csrf).toEqual(expect.arrayContaining(trustedOrigins()))
    expect(sanitized.cors).toEqual(trustedOrigins())
  })
})

describe('the member endpoints’ Origin check', () => {
  const post = (origin: string, host = 'pjk.co.in') =>
    new Request(`https://${host}/next/members/request-code`, {
      method: 'POST',
      headers: { origin, host },
    })

  const withEnv = <T>(env: Record<string, string>, run: () => T): T => {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    try {
      return run()
    } finally {
      process.env = saved
    }
  }

  it('in production, refuses a vercel.app origin', () => {
    withEnv(production, () => {
      expect(fromOurOrigin(post('https://pjk.co.in'))).toBe(true)
      expect(fromOurOrigin(post(`https://${production.VERCEL_URL}`))).toBe(false)
    })
  })

  it('on a preview, accepts the preview’s own origins', () => {
    withEnv(preview, () => {
      expect(fromOurOrigin(post(`https://${preview.VERCEL_BRANCH_URL}`, 'internal'))).toBe(true)
      expect(fromOurOrigin(post(`https://${preview.VERCEL_URL}`, 'internal'))).toBe(true)
      expect(fromOurOrigin(post('https://evil.example', 'internal'))).toBe(false)
    })
  })
})
