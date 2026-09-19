import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'

import { isSuperAdmin } from '@/access/roles'
import { readSubmissions } from '@/collections/FormSubmissions/overrides'
import { revalidateFrontend } from '@/hooks/revalidateFrontend'
import { docPath, referenceHref } from '@/utilities/docHref'
import { normalizeHost } from '@/utilities/host'

describe('docPath', () => {
  it('maps each collection to its public URL', () => {
    expect(docPath('pages', 'home')).toBe('/')
    expect(docPath('pages', 'about')).toBe('/about')
    expect(docPath('posts', 'hello')).toBe('/journal/hello')
    expect(docPath('ventures', 'phulhaar-gallery')).toBe('/ventures/phulhaar-gallery')
  })

  it('resolves populated link references and ignores unpopulated ones', () => {
    expect(referenceHref({ relationTo: 'ventures', value: { slug: 'x' } })).toBe('/ventures/x')
    expect(referenceHref({ relationTo: 'pages', value: 12 })).toBeNull()
    expect(referenceHref(null)).toBeNull()
  })
})

describe('normalizeHost', () => {
  it('lowercases and strips ports', () => {
    expect(normalizeHost('PJK.co.in:443')).toBe('pjk.co.in')
    expect(normalizeHost('pjk.localhost:3000')).toBe('pjk.localhost')
    expect(normalizeHost(null)).toBe('localhost')
  })

  /**
   * The host is interpolated into the internal rewrite path, so anything that is not a plain
   * hostname has to be thrown away. A slash or a dot segment here would otherwise walk the
   * rewrite out of /tenant-sites and straight into the admin panel, past the sign-in gate.
   */
  it('refuses anything that is not a hostname', () => {
    expect(normalizeHost('x/../../admin')).toBe('localhost')
    expect(normalizeHost('x/../../api/users')).toBe('localhost')
    expect(normalizeHost('..')).toBe('localhost')
    expect(normalizeHost('a/b')).toBe('localhost')
    expect(normalizeHost('pjk.co.in/evil')).toBe('localhost')
    expect(normalizeHost('pjk.co.in\\evil')).toBe('localhost')
    expect(normalizeHost('pjk.co.in?x=1')).toBe('localhost')
    expect(normalizeHost('pjk.co.in#x')).toBe('localhost')
    expect(normalizeHost('pjk .co.in')).toBe('localhost')
    expect(normalizeHost('-pjk.co.in')).toBe('localhost')
    expect(normalizeHost('pjk..co.in')).toBe('localhost')
    expect(normalizeHost('')).toBe('localhost')
  })

  it('still accepts the hostnames we actually serve', () => {
    for (const host of ['pjk.co.in', 'www.pjk.co.in', 'pjk.localhost', 'localhost', 'a-b.co.in']) {
      expect(normalizeHost(host)).toBe(host)
    }
  })
})

describe('access control', () => {
  const editor = { id: 2, roles: ['editor'], tenants: [{ tenant: 7 }], collection: 'users' }
  const admin = { id: 1, roles: ['super-admin'], collection: 'users' }

  it('recognises super admins only', () => {
    expect(isSuperAdmin(admin as never)).toBe(true)
    expect(isSuperAdmin(editor as never)).toBe(false)
    expect(isSuperAdmin(null)).toBe(false)
  })

  it('never shows enquiries to the public, and scopes editors to their brands', () => {
    const call = (user: unknown) => readSubmissions({ req: { user } } as never)
    expect(call(null)).toBe(false)
    expect(call(admin)).toBe(true)
    expect(call(editor)).toEqual({ tenant: { in: [7] } })
  })
})

describe('revalidateFrontend', () => {
  it('purges the whole frontend cache after a change', () => {
    const req = { context: {}, payload: { logger: { debug: vi.fn() } } }
    revalidateFrontend({ doc: {}, req } as never)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('skips revalidation when asked to (seed scripts, bulk imports)', () => {
    vi.mocked(revalidatePath).mockClear()
    const req = { context: { disableRevalidate: true }, payload: { logger: { debug: vi.fn() } } }
    revalidateFrontend({ doc: {}, req } as never)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
