import type { CollectionConfig } from 'payload'
import { publicError } from '@/utilities/publicError'

import { authenticated } from '../../access/authenticated'
import { superAdminOnly, superAdminOnlyField, superAdminOrSelf } from '../../access/roles'
import {
  COMPANY_EMAIL_DOMAIN,
  GATE_COOKIE,
  isCompanyEmail,
  normaliseEmail,
} from '../../security/constants'
import { emailFooter } from '../../email/footer'
import { readGateToken } from '../../security/gateToken'
import { getServerSideURL } from '../../utilities/getURL'
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
    // Payload leaves Secure off by default. Over HTTPS (production) the session cookie is never
    // to be sent in the clear; browsers treat localhost as secure, so `pnpm start` still works.
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
    // The "choose your password" email sent on approval and by "Forgot password": Payload's
    // wording, in the site's voice, signed off with the registered office
    forgotPassword: {
      generateEmailSubject: () => 'Choose your PJK admin password',
      generateEmailHTML: async (args) => {
        const { req, token } = args ?? {}
        if (!req || !token) return ''
        const { routes, admin } = req.payload.config
        const url = `${getServerSideURL()}${routes.admin}${admin.routes.reset}/${token}`
        const footer = await emailFooter(req.payload)
        const p = 'font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#16201a'
        return `<p style="${p}">Use this link to choose a password for your PAT and J.K. Co. admin account. It works once, for one hour.</p>
<p style="${p}"><a href="${url}" style="color:#0f2a18">${url}</a></p>
<p style="${p};color:#5f6660">If you did not expect this, ignore it: nothing changes until the link is used.</p>${footer.html}`
      },
    },
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
        {
          label: 'KYC reviewer (may reveal identity and bank details, every time logged)',
          value: 'kyc-reviewer',
        },
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
            throw publicError(
              `Admin accounts must use an @${COMPANY_EMAIL_DOMAIN} email address.`,
              400,
            )
          }
          data.email = email
        }

        // Password rules are enforced here so they apply to every route into the app
        if (typeof data.password === 'string' && data.password.length > 0) {
          const problem = passwordProblem(data.password, data.email ?? req.user?.email)
          if (problem) throw publicError(`Password too weak: ${problem}`, 400)
        }

        return data
      },
    ],
    beforeLogin: [
      ({ req, user }) => {
        // Local API sign-ins (scripts) have no browser request to check
        const isLocal = req.payloadAPI === 'local'

        if (user.status !== 'active') {
          throw publicError('This account is not active. Ask a super admin to re-enable it.', 403)
        }
        if (!isCompanyEmail(user.email)) {
          throw publicError('This account cannot sign in.', 403)
        }
        if (!isLocal) {
          // The one-time code must have been sent to this same mailbox, so a code for one
          // account cannot be used to try passwords against another.
          const verified = gateEmail(req)
          if (!verified || verified !== normaliseEmail(user.email)) {
            throw publicError(
              'Request a sign-in code for this address first at /admin-access.',
              403,
            )
          }
        }
        return user
      },
    ],
  },
  timestamps: true,
}
