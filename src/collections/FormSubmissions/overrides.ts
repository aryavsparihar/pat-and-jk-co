import type { Access, CollectionBeforeChangeHook, Field } from 'payload'
import { APIError } from 'payload'

import { getTenantAccess } from '@payloadcms/plugin-multi-tenant/utilities'

import { isSuperAdmin } from '@/access/roles'

/** Hidden field rendered by the frontend form. Humans never fill it in; bots usually do. */
export const HONEYPOT_FIELD = 'company_website'

const MAX_FIELDS = 30
const MAX_VALUE_LENGTH = 5000
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 }

// Per-instance, in-memory limiter. A baseline against floods from a single IP;
// swap for Cloudflare Turnstile or an Upstash limiter if spam ever becomes a problem.
const hits = new Map<string, number[]>()

const rateLimited = (ip: string) => {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > RATE_LIMIT.max
}

type SubmissionEntry = { field: string; value: unknown }

/**
 * Runs before a public form submission is stored:
 * rejects bots and floods, trims oversized input, and files the submission under
 * the same brand (tenant) as its form so each brand only sees its own enquiries.
 */
export const protectSubmission: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data

  const entries: SubmissionEntry[] = Array.isArray(data.submissionData) ? data.submissionData : []

  const honeypot = entries.find((e) => e.field === HONEYPOT_FIELD)
  if (honeypot && String(honeypot.value ?? '').trim() !== '') {
    throw new APIError('Your message could not be sent.', 400, undefined, true)
  }

  if (!req.user) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (rateLimited(ip)) {
      throw new APIError(
        'Too many messages in a short time — please try again in a few minutes.',
        429,
        undefined,
        true,
      )
    }
  }

  if (entries.length > MAX_FIELDS) {
    throw new APIError('Too many fields in submission.', 400, undefined, true)
  }

  data.submissionData = entries
    .filter((e) => e.field !== HONEYPOT_FIELD)
    .map((e) => ({ field: String(e.field), value: String(e.value ?? '').slice(0, MAX_VALUE_LENGTH) }))

  const formID = typeof data.form === 'object' && data.form ? data.form.id : data.form
  if (formID) {
    const form = await req.payload.findByID({
      collection: 'forms',
      id: formID,
      depth: 0,
      req,
      overrideAccess: true,
    })
    const tenant = (form as { tenant?: number | { id: number } | null }).tenant
    data.tenant = tenant && typeof tenant === 'object' ? tenant.id : tenant
  }

  return data
}

export const submissionTenantField: Field = {
  name: 'tenant',
  label: 'Brand',
  type: 'relationship',
  relationTo: 'tenants',
  index: true,
  admin: {
    position: 'sidebar',
    readOnly: true,
  },
}

/** Super admins see all enquiries; editors see only their brands'; the public sees none. */
export const readSubmissions: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  return getTenantAccess({ fieldName: 'tenant', user: user as never })
}
