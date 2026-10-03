import type { Access, CollectionBeforeChangeHook, Field } from 'payload'
import { APIError } from 'payload'

import { getTenantAccess } from '@payloadcms/plugin-multi-tenant/utilities'

import { isStaff, isSuperAdmin } from '@/access/roles'
import { clientIp } from '@/security/constants'
import { hitLimit } from '@/security/rateLimit'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

const MAX_FIELDS = 30
const MAX_VALUE_LENGTH = 5000
/** Five messages per address per ten minutes, counted in Postgres across every instance */
const RATE_LIMIT = { max: 5, windowSeconds: 10 * 60 }

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

  // Visitors are limited and checked; staff and server code calling the Local API (seeds, tests)
  // are not
  if (!isStaff(req.user) && req.payloadAPI !== 'local') {
    const token = entries.find((e) => e.field === TURNSTILE_FIELD)?.value
    const human = await verifyTurnstile(token, 'contact')
    if (!human.ok) {
      req.payload.logger.warn(`Form submission refused by the bot check: ${human.reason}`)
      throw new APIError(
        'We could not confirm this came from a person. Please try again.',
        400,
        undefined,
        true,
      )
    }
    if (human.note) req.payload.logger.warn(`Bot check skipped (form): ${human.note}`)

    const { allowed } = await hitLimit(req.payload, {
      scope: 'form-submit',
      subject: clientIp(req.headers),
      ...RATE_LIMIT,
    })
    if (!allowed) {
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

  const formID = typeof data.form === 'object' && data.form ? data.form.id : data.form
  if (!formID) throw new APIError('Missing form.', 400, undefined, true)

  const form = (await req.payload.findByID({
    collection: 'forms',
    id: formID,
    depth: 0,
    req,
    overrideAccess: true,
  })) as {
    tenant?: number | { id: number } | null
    fields?:
      | {
          blockType: string
          name?: string
          label?: string | null
          required?: boolean | null
          options?: { value?: string | null }[] | null
        }[]
      | null
  }

  // Keep only fields that exist on the form, and check required ones server-side
  // (the browser validates too, but requests can be crafted by hand)
  const formFields = (form.fields ?? []).filter((f) => f.name)
  const allowed = new Set(formFields.map((f) => f.name))
  const cleaned = entries
    .filter((e) => e.field !== HONEYPOT_FIELD && allowed.has(String(e.field)))
    .map((e) => ({
      field: String(e.field),
      value: String(e.value ?? '')
        .trim()
        .slice(0, MAX_VALUE_LENGTH),
    }))

  for (const field of formFields) {
    const value = cleaned.find((e) => e.field === field.name)?.value ?? ''
    if (field.required && !value) {
      throw new APIError(`Please fill in “${field.label || field.name}”.`, 400, undefined, true)
    }
    if (field.blockType === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new APIError('Please enter a valid email address.', 400, undefined, true)
    }
    // A dropdown may only ever come back with one of its own options, whatever the browser sent
    if (field.blockType === 'select' && value) {
      const options = (field.options ?? []).map((o) => o.value)
      if (!options.includes(value)) {
        throw new APIError(
          `Choose one of the listed options for “${field.label || field.name}”.`,
          400,
          undefined,
          true,
        )
      }
    }
  }

  data.submissionData = cleaned
  data.tenant = form.tenant && typeof form.tenant === 'object' ? form.tenant.id : form.tenant

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
  if (!isStaff(user)) return false
  if (isSuperAdmin(user)) return true
  return getTenantAccess({ fieldName: 'tenant', user: user as never })
}
