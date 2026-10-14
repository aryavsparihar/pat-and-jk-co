import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from '@playwright/test'

import {
  approveAs,
  BASE,
  cleanUp,
  memberCookie,
  payload,
  staffCookie,
  uniqueEmail,
} from '../helpers/e2e'
import { ensureApplication } from '../../src/members/accounts.js'

/*
 * Who may reach what, over real HTTP through the proxy, as a browser would: every page, every
 * route handler and every Payload collection, with no session, with expired sessions, as a
 * member, as an editor and as a super admin. The tables below are the intended access; the first
 * test fails when a route or collection exists that they do not mention, so nothing new can be
 * added without deciding who may reach it.
 */

type Who = 'anonymous' | 'expired' | 'member' | 'editor' | 'admin'
const WHO: Who[] = ['anonymous', 'expired', 'member', 'editor', 'admin']

/** Every route file under src/app, by its URL (brand pages without the internal prefix) */
const ROUTES: Record<string, 'public' | 'member' | 'staff' | 'secret' | 'token'> = {
  // Pages
  '/': 'public',
  '/[slug]': 'public',
  '/journal': 'public',
  '/journal/[slug]': 'public',
  '/ventures': 'public',
  '/ventures/[slug]': 'public',
  '/collaborate': 'public',
  '/collaborate/artists': 'public',
  '/collaborate/partners': 'public',
  '/collaborate/signin': 'public',
  '/admin-access': 'public',
  '/robots.txt': 'public',
  '/sitemap.xml': 'public',
  '/account': 'member',
  '/account/settings': 'member',
  '/account/profile': 'member',
  '/account/works': 'member',
  '/account/works/new': 'member',
  '/account/works/[id]': 'member',
  '/account/payouts': 'member',
  // Reached from the "This was not me" link in an email; the token in the link is the key
  '/account/bank-change/cancel': 'token',
  '/admin/[[...segments]]': 'staff',
  '/api/[...slug]': 'staff', // Payload's REST API: collection by collection, below
  '/api/health': 'public',
  // Route handlers
  '/next/admin-gate/request-access': 'public',
  '/next/admin-gate/request-code': 'public',
  '/next/admin-gate/verify-code': 'public',
  '/next/cron/kyc-purge': 'secret',
  '/next/preview': 'secret',
  '/next/exit-preview': 'public',
  '/next/visits': 'public',
  '/next/members/request-code': 'public',
  '/next/members/verify-code': 'public',
  '/next/members/session': 'public',
  '/next/members/sign-out': 'public',
  '/next/members/sign-out-everywhere': 'member',
  '/next/members/kyc/bank-change/cancel': 'token',
  '/next/members/application': 'member',
  '/next/members/application/partner': 'member',
  '/next/members/application/reapply': 'member',
  '/next/members/application/start': 'member',
  '/next/members/application/step': 'member',
  '/next/members/application/submit': 'member',
  '/next/members/application/withdraw': 'member',
  '/next/members/data-request': 'member',
  '/next/members/kyc': 'member',
  '/next/members/kyc/bank-change': 'member',
  '/next/members/kyc/document': 'member',
  '/next/members/kyc/identity-code': 'member',
  '/next/members/kyc/ifsc': 'member',
  '/next/members/pincode': 'member',
  '/next/members/portal/artworks': 'member',
  '/next/members/portal/artworks/[id]': 'member',
  '/next/members/portal/artworks/[id]/archive': 'member',
  '/next/members/portal/artworks/order': 'member',
  '/next/members/portal/contact': 'member',
  '/next/members/portal/email': 'member',
  '/next/members/portal/email/confirm': 'member',
  '/next/members/portal/profile': 'member',
  '/next/members/portal/sessions': 'member',
  '/next/members/portal/sessions/[id]': 'member',
  '/next/members/portfolio': 'member',
  '/next/members/portfolio/upload-token': 'member',
  '/next/members/step-up': 'member',
  '/next/members/step-up/confirm': 'member',
}

/**
 * Who may read each collection through /api/<slug>: everyone; a member only their own rows
 * ('own'); staff; a member of staff only their own account ('self'); super admins; KYC reviewers
 * (and super admins); or nobody at all through the API.
 */
const COLLECTIONS: Record<string, 'public' | 'own' | 'staff' | 'self' | 'admin' | 'kyc' | 'none'> =
  {
    pages: 'public',
    posts: 'public',
    categories: 'public',
    media: 'public',
    'site-settings': 'public',
    ventures: 'public',
    people: 'public',
    openings: 'public',
    redirects: 'public',
    forms: 'public',
    'visitor-counts': 'staff',
    tenants: 'staff',
    users: 'self',
    members: 'own',
    applications: 'own',
    // Pictures of approved works are public; a member also sees their own
    'portfolio-images': 'public',
    artworks: 'staff',
    'kyc-records': 'kyc',
    'kyc-documents': 'kyc',
    'access-requests': 'admin',
    'security-events': 'admin',
    'login-challenges': 'none',
    'rate-limits': 'none',
    'member-sessions': 'none',
    'form-submissions': 'staff',
    'payload-kv': 'none',
    'payload-jobs': 'none',
    'payload-folders': 'staff',
    'payload-locked-documents': 'staff',
    'payload-preferences': 'staff',
    // Payload offers no API on its migrations table at all (501)
    'payload-migrations': 'none',
  }

/** Staff-only actions on records: who may call them, and with what */
const ACTIONS: { path: string; who: 'staff' | 'kyc' }[] = [
  { path: '/api/applications/999999999/decide', who: 'staff' },
  { path: '/api/applications/999999999/allow-reapply', who: 'staff' },
  { path: '/api/artworks/999999999/review', who: 'staff' },
  { path: '/api/members/999999999/profile-review', who: 'staff' },
  { path: '/api/members/999999999/change-email', who: 'kyc' },
  { path: '/api/kyc-records/999999999/reveal', who: 'kyc' },
  { path: '/api/kyc-records/999999999/approve-bank-change', who: 'kyc' },
  { path: '/api/kyc-records/999999999/request-payout-details', who: 'kyc' },
  { path: '/api/kyc-records/999999999/record-withdrawal', who: 'kyc' },
  { path: '/api/kyc-records/999999999/legal-hold', who: 'kyc' },
  { path: '/api/kyc-documents/999999999/download', who: 'kyc' },
]

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/app')

/** Every page and route handler, as a URL pattern */
const routeFiles = (dir = appDir): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    if (!/^(page|route)\.tsx?$/.test(name)) return []
    const url = path
      .relative(appDir, path.dirname(full))
      .split(path.sep)
      .filter((part) => !/^\(.*\)$/.test(part))
      .join('/')
      .replace(/^tenant-sites\/\[host\]\/?/, '')
    return [`/${url}`.replace(/\/$/, '') || '/']
  })

let api: APIRequestContext
const cookies: Record<Who, string> = {} as never
let otherWork: { id: number; title: string }
let otherApplication: { id: number; reference: string }
let ownMemberId: number

const call = (method: string, url: string, who: Who, data?: unknown) =>
  api.fetch(url, {
    method,
    headers: {
      cookie: cookies[who],
      origin: BASE,
      'sec-fetch-site': 'same-origin',
      ...(data === undefined ? {} : { 'content-type': 'application/json' }),
    },
    data: data === undefined ? undefined : JSON.stringify(data),
    maxRedirects: 0,
    failOnStatusCode: false,
  })

const refused = (status: number, label?: string) => expect([401, 403], label).toContain(status)

test.beforeAll(async () => {
  await cleanUp()
  api = await playwrightRequest.newContext({ baseURL: BASE })
  const p = await payload()
  // The member, an approved artist, and another member whose records they must never reach
  const own = await ensureApplication(p, { email: uniqueEmail('routes-own'), type: 'artist' })
  await approveAs(own.member.id)
  ownMemberId = own.member.id
  const other = await ensureApplication(p, { email: uniqueEmail('routes-other'), type: 'artist' })
  await approveAs(other.member.id)
  otherApplication = { id: other.application.id, reference: other.application.reference }
  const work = await p.create({
    collection: 'artworks',
    data: { owner: other.member.id, title: 'Not yours, Routes test' } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  otherWork = { id: work.id, title: 'Not yours, Routes test' }

  cookies.anonymous = ''
  cookies.member = await memberCookie(own.member.id)
  cookies.editor = await staffCookie({ email: 'e2e-routes-editor@pjk.co.in', roles: ['editor'] })
  cookies.admin = await staffCookie({ email: 'e2e-routes-admin@pjk.co.in', roles: ['super-admin'] })
  // Both kinds of session, both expired
  cookies.expired = [
    await memberCookie(own.member.id, { expired: true }),
    await staffCookie({
      email: 'e2e-routes-expired@pjk.co.in',
      roles: ['super-admin'],
      seconds: -1,
    }),
  ].join('; ')
})

test.afterAll(async () => {
  await api?.dispose()
  await cleanUp()
})

test('every route and collection has a decided audience', async () => {
  const found = routeFiles().sort()
  expect(found.filter((r) => !(r in ROUTES))).toEqual([])
  expect(Object.keys(ROUTES).filter((r) => !found.includes(r))).toEqual([])
  const slugs = Object.keys((await payload()).collections).sort()
  expect(slugs.filter((s) => !(s in COLLECTIONS))).toEqual([])
  expect(Object.keys(COLLECTIONS).filter((s) => !slugs.includes(s))).toEqual([])
})

test('public pages open for everyone', async () => {
  for (const url of [
    '/',
    '/about',
    '/journal',
    '/ventures',
    '/ventures/phulhaar-gallery',
    '/collaborate',
    '/collaborate/artists',
    '/collaborate/signin',
    '/admin-access',
    '/robots.txt',
    '/sitemap.xml',
    '/api/health',
  ]) {
    for (const who of WHO)
      expect((await call('GET', url, who)).status(), `${url} as ${who}`).toBe(200)
  }
})

test('account pages are for the signed-in member only, typed straight in or not', async () => {
  for (const url of [
    '/account',
    '/account/settings',
    '/account/profile',
    '/account/works',
    '/account/works/new',
    '/account/payouts',
  ]) {
    for (const who of ['anonymous', 'expired', 'editor', 'admin'] as const) {
      const response = await call('GET', url, who)
      expect(response.status(), `${url} as ${who}`).toBe(307)
      expect(response.headers().location, `${url} as ${who}`).toMatch(/\/collaborate\/signin/)
    }
    expect((await call('GET', url, 'member')).status(), `${url} as member`).toBe(200)
  }
  // Another member's work, by its address: not found, and its title nowhere in the page
  const theirs = await call('GET', `/account/works/${otherWork.id}`, 'member')
  expect(theirs.status()).toBe(404)
  expect(await theirs.text()).not.toContain(otherWork.title)
})

test('the admin is behind the gate for everyone but staff, record pages included', async () => {
  for (const url of [
    '/admin',
    '/admin/collections/applications',
    `/admin/collections/applications/${otherApplication.id}`,
    '/admin/collections/kyc-records',
    `/admin/collections/members/${ownMemberId}`,
    '/api/users/me',
  ]) {
    for (const who of ['anonymous', 'expired', 'member'] as const) {
      const response = await call('GET', url, who)
      if (url.startsWith('/api/')) {
        // The expired staff session still carries a valid gate: Payload itself says no one
        if (who === 'expired') {
          expect(((await response.json()) as { user: unknown }).user, `${url} as ${who}`).toBeNull()
        } else expect(response.status(), `${url} as ${who}`).toBe(401)
      } else if (who === 'expired') {
        // Through the gate, but the expired session shows only the sign-in form
        expect(await response.text(), `${url} as ${who}`).not.toContain(otherApplication.reference)
      } else {
        expect(response.status(), `${url} as ${who}`).toBe(307)
        expect(response.headers().location, `${url} as ${who}`).toMatch(/\/admin-access/)
      }
    }
  }
  expect((await call('GET', '/admin', 'editor')).status()).toBe(200)
  // An editor cannot open identity details, even by typing the address
  const kyc = await call('GET', '/api/kyc-records?limit=1', 'editor')
  refused(kyc.status())
})

test('member endpoints refuse anyone without a live member session', async () => {
  for (const [route, audience] of Object.entries(ROUTES)) {
    if (audience !== 'member' || !route.startsWith('/next/')) continue
    const url = route.replace('[id]', '999999999')
    for (const who of ['anonymous', 'expired', 'editor', 'admin'] as const) {
      for (const method of ['GET', 'POST']) {
        const status = (await call(method, url, who, method === 'POST' ? {} : undefined)).status()
        // 405 where the route has no such method; never anything that did the work
        expect([401, 405], `${method} ${url} as ${who}`).toContain(status)
      }
    }
  }
})

test('cron and preview routes need their secret, whoever asks', async () => {
  for (const who of WHO) {
    refused((await call('GET', '/next/cron/kyc-purge', who)).status())
    refused(
      (
        await call(
          'GET',
          '/api/payload-jobs/run',
          who === 'editor' || who === 'admin' ? 'anonymous' : who,
        )
      ).status(),
    )
    refused((await call('GET', '/next/preview?path=/&previewSecret=wrong', who)).status())
  }
})

test('each collection is read only by those it is meant for, and a member sees only their own', async () => {
  const allowed = (rule: (typeof COLLECTIONS)[string], who: Who) =>
    rule === 'public' ||
    (rule === 'own' && who !== 'anonymous' && who !== 'expired') ||
    (rule === 'staff' && (who === 'editor' || who === 'admin')) ||
    (rule === 'self' && (who === 'editor' || who === 'admin')) ||
    ((rule === 'admin' || rule === 'kyc') && who === 'admin')
  for (const [slug, rule] of Object.entries(COLLECTIONS)) {
    for (const who of WHO) {
      const response = await call('GET', `/api/${slug}?limit=50&depth=0`, who)
      const label = `GET /api/${slug} as ${who}`
      if (slug === 'payload-migrations') {
        expect([401, 403, 501], label).toContain(response.status())
        continue
      }
      if (slug === 'users' && (who === 'anonymous' || who === 'member')) {
        expect(response.status(), label).toBe(401) // the gate
        continue
      }
      if (!allowed(rule, who)) {
        if (slug === 'users' && who === 'expired') {
          // Past the gate, but no user: Payload shows nothing
          expect(response.status(), label).toBe(403)
          continue
        }
        refused(response.status(), label)
        continue
      }
      expect(response.status(), label).toBe(200)
      const docs = ((await response.json()) as { docs: Record<string, unknown>[] }).docs
      if (rule === 'own' && who === 'member') {
        for (const doc of docs) {
          const owner = slug === 'members' ? doc.id : (doc.member ?? doc.owner)
          expect(owner, `${label}: someone else's row`).toBe(ownMemberId)
        }
      }
      if (rule === 'self' && who === 'editor') expect(docs.length, label).toBeLessThanOrEqual(1)
      // A public picture does not name the member behind it
      if (slug === 'portfolio-images' && (who === 'anonymous' || who === 'expired')) {
        for (const doc of docs) expect(doc, label).not.toHaveProperty('owner')
      }
    }
  }
})

test('nobody without the right role can create, change or delete through the API', async () => {
  for (const slug of Object.keys(COLLECTIONS)) {
    for (const who of ['anonymous', 'expired', 'member'] as const) {
      if (slug === 'users' && who !== 'expired') continue // the gate answers first, tested above
      const label = (m: string) => `${m} /api/${slug} as ${who}`
      // Payload offers no writes on its migrations table at all (501)
      const no = slug === 'payload-migrations' ? [401, 403, 404, 501] : [401, 403, 404]
      if (slug !== 'form-submissions') {
        const post = await call('POST', `/api/${slug}`, who, {})
        expect(slug === 'payload-migrations' ? no : [401, 403], label('POST')).toContain(
          post.status(),
        )
      }
      const patch = await call('PATCH', `/api/${slug}/999999999`, who, { title: 'x' })
      expect(no, label('PATCH')).toContain(patch.status())
      const del = await call('DELETE', `/api/${slug}/999999999`, who)
      expect(no, label('DELETE')).toContain(del.status())
    }
  }
  // A member cannot change another member's records, even knowing their ids
  const before = (await payload()).findByID({
    collection: 'applications',
    id: otherApplication.id,
    overrideAccess: true,
  })
  for (const [method, url] of [
    ['PATCH', `/api/applications/${otherApplication.id}`],
    ['DELETE', `/api/applications/${otherApplication.id}`],
    ['PATCH', `/api/artworks/${otherWork.id}`],
    ['DELETE', `/api/artworks/${otherWork.id}`],
    ['PATCH', `/next/members/portal/artworks/${otherWork.id}`],
    ['POST', `/next/members/portal/artworks/${otherWork.id}/archive`],
  ] as const) {
    // A body that passes every check but ownership, so the ownership check is what refuses it
    const response = await call(method, url, 'member', {
      title: 'Taken over',
      forSale: false,
      images: [1],
      archived: true,
    })
    expect([401, 403, 404], `${method} ${url}`).toContain(response.status())
  }
  const after = await (
    await payload()
  ).findByID({
    collection: 'applications',
    id: otherApplication.id,
    overrideAccess: true,
  })
  expect(after.updatedAt).toBe((await before).updatedAt)
  const work = await (
    await payload()
  ).findByID({
    collection: 'artworks',
    id: otherWork.id,
    overrideAccess: true,
  })
  expect(work.title).toBe(otherWork.title)
})

test('staff actions refuse members, visitors and, for identity details, editors', async () => {
  for (const action of ACTIONS) {
    const refusedFor: Who[] =
      action.who === 'kyc'
        ? ['anonymous', 'expired', 'member', 'editor']
        : ['anonymous', 'expired', 'member']
    for (const who of refusedFor) {
      refused((await call('POST', action.path, who, {})).status(), `POST ${action.path} as ${who}`)
    }
  }
})
