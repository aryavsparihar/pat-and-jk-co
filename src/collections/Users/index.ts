import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { authenticated } from '../../access/authenticated'
import { superAdminOnly, superAdminOnlyField, superAdminOrSelf } from '../../access/roles'
import {
  COMPANY_EMAIL_DOMAIN,
  GATE_COOKIE,
  isCompanyEmail,
  normaliseEmail,
} from '../../security/constants'
import { readGateToken } from '../../security/gateToken'
import { passwordProblem } from '../../security/otp'

/** Reads the admin-gate cookie off an incoming request. */
const gateEmail = (req: { headers?: Headers }): string | null => {
  const header = req.headers?.get?.('cookie')
  if (!header) return null
  const cookie = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GATE_COOKIE}=`))
  if (!cookie) return null
  return readGateToken(decodeURIComponent(cookie.slice(GATE_COOKIE.length + 1)))?.email ?? null
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: superAdminOnly,
    delete: superAdminOnly,
    read: superAdminOrSelf,
    update: superAdminOrSelf,
  },
  admin: {
    defaultColumns: ['name', 'email', 'roles', 'status'],
    group: 'Administration',
    description: `Everyone who can sign in. Accounts must use an @${COMPANY_EMAIL_DOMAIN} address, and only super admins can create them or change what they can do.`,
    useAsTitle: 'name',
  },
  auth: {
    // An admin session lasts a working day; after that, sign in again
    tokenExpiration: 60 * 60 * 8,
    // Payload locks an account after repeated wrong passwords
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['editor'],
      required: true,
      saveToJWT: true,
      options: [
        { label: 'Super admin (all brands, users & domains)', value: 'super-admin' },
        { label: 'Editor (content for assigned brands)', value: 'editor' },
      ],
      access: {
        // Only super admins may grant or change roles — prevents privilege escalation
        create: superAdminOnlyField,
        update: superAdminOnlyField,
      },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      saveToJWT: true,
      options: [
        { label: 'Active — can sign in', value: 'active' },
        { label: 'Suspended — cannot sign in', value: 'suspended' },
      ],
      access: {
        create: superAdminOnlyField,
        update: superAdminOnlyField,
      },
      admin: {
        position: 'sidebar',
        description:
          'Suspending someone blocks sign-in immediately, without deleting their account or their work.',
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        if (!data) return data

        if (data.email !== undefined) {
          const email = normaliseEmail(data.email)
          if (!isCompanyEmail(email)) {
            throw new APIError(
              `Admin accounts must use an @${COMPANY_EMAIL_DOMAIN} email address.`,
              400,
              undefined,
              true,
            )
          }
          data.email = email
        }

        // Password rules are enforced here so they apply to every route into the app
        if (typeof data.password === 'string' && data.password.length > 0) {
          const problem = passwordProblem(data.password, data.email ?? req.user?.email)
          if (problem) throw new APIError(`Password too weak: ${problem}`, 400, undefined, true)
        }

        return data
      },
    ],
    beforeLogin: [
      ({ req, user }) => {
        // Local API sign-ins (scripts) have no browser request to check
        const isLocal = req.payloadAPI === 'local'

        if (user.status !== 'active') {
          throw new APIError(
            'This account is not active. Ask a super admin to re-enable it.',
            403,
            undefined,
            true,
          )
        }
        if (!isCompanyEmail(user.email)) {
          throw new APIError('This account cannot sign in.', 403, undefined, true)
        }
        if (!isLocal) {
          // The one-time code must have been sent to this same mailbox, so a code for one
          // account cannot be used to try passwords against another.
          const verified = gateEmail(req)
          if (!verified || verified !== normaliseEmail(user.email)) {
            throw new APIError(
              'Request a sign-in code for this address first at /admin-access.',
              403,
              undefined,
              true,
            )
          }
        }
        return user
      },
    ],
  },
  timestamps: true,
}
