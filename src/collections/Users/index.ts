import type { CollectionConfig } from 'payload'
import { publicError } from '@/utilities/publicError'

import { authenticated } from '../../access/authenticated'
import {
  isSuperAdmin,
  superAdminOnly,
  superAdminOnlyField,
  superAdminOrSelf,
} from '../../access/roles'
import {
  clientIp,
  COMPANY_EMAIL_DOMAIN,
  GATE_COOKIE,
  GATE_TTL_SECONDS,
  isCompanyEmail,
  normaliseEmail,
} from '../../security/constants'
import { emailFooter } from '../../email/footer'
import { notifyStaffLockout } from '../../security/email'
import { logSecurityEvent } from '../../security/events'
import { readGateToken } from '../../security/gateToken'
import { refuse } from '../../security/refused'
import { hitLimit } from '../../security/rateLimit'
import { getServerSideURL } from '../../utilities/getURL'
import { BREACHED_MESSAGE, isBreachedPassword } from '../../security/breachedPassword'
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

/**
 * The staff password rules, then the breach check. Used when a password is set (create, update)
 * and when it is reset from an emailed link.
 */
const checkStaffPassword = async (
  password: string,
  email: string | undefined,
  logger: { warn: (o: object) => void },
) => {
  const problem = passwordProblem(password, email)
  if (problem) throw publicError(`Password too weak: ${problem}`, 400)
  const breached = await isBreachedPassword(password)
  if (breached) throw publicError(BREACHED_MESSAGE, 400)
  if (breached === null) {
    logger.warn({ msg: 'Breached-password check skipped: the service could not be reached' })
  }
}

/** Staff sessions: 30 minutes without activity, 12 hours at most */
const STAFF_IDLE_SECONDS = 30 * 60
const STAFF_ABSOLUTE_SECONDS = GATE_TTL_SECONDS

const MAX_LOGIN_ATTEMPTS = 5
const LOCK_MINUTES = 15

/** A request to Payload's sign-in endpoint, and the address it was for */
const loginAttempt = (req: { url?: string; data?: unknown }) =>
  /\/users\/login(?:\?|$)/.test(req.url ?? '') &&
  typeof (req.data as { email?: unknown })?.email === 'string'
    ? normaliseEmail((req.data as { email: string }).email)
    : null

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: superAdminOnly,
    // Never outright: an account is deleted by erasing it (POST /api/users/:id/erase), so the
    // records that name who did what keep pointing at "Deleted staff (ST-0007)"
    delete: () => false,
    read: superAdminOrSelf,
    update: superAdminOrSelf,
  },
  admin: {
    defaultColumns: ['name', 'staffRef', 'email', 'roles', 'status'],
    group: 'Administration',
    description: `Everyone who can sign in. Accounts must use an @${COMPANY_EMAIL_DOMAIN} address, and only super admins can create them or change what they can do.`,
    useAsTitle: 'name',
  },
  auth: {
    // A session ends after 30 minutes without activity (the admin refreshes it while in use),
    // and never lasts more than 12 hours, the gate's own limit (beforeOperation, below)
    tokenExpiration: STAFF_IDLE_SECONDS,
    // Payload leaves Secure off by default. Over HTTPS (production) the session cookie is never
    // to be sent in the clear; browsers treat localhost as secure, so `pnpm start` still works.
    // Strict: no other site can make a browser send it, not even by a link
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
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
    maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
    lockTime: LOCK_MINUTES * 60 * 1000,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      // ST-0007: given when the account is made, from a sequence, and never reused, so a deleted
      // account can still be told apart from every other (src/people/erase.ts)
      name: 'staffRef',
      label: 'Staff reference',
      type: 'text',
      unique: true,
      index: true,
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      // Delete and erase: super admins only, never their own account or the last super admin
      name: 'erase',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/ErasePanel#ErasePanel' },
      },
    },
    {
      name: 'erasure',
      label: 'Deleted',
      type: 'group',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, condition: (data) => Boolean(data?.erasure?.at) },
      fields: [
        { name: 'at', label: 'Deleted on', type: 'date' },
        { name: 'by', label: 'Deleted by', type: 'relationship', relationTo: 'users' },
        { name: 'reason', type: 'textarea' },
      ],
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
        // Only ever set by the erasure
        { label: 'Deleted — details erased', value: 'erased' },
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
    // A reset sets the password without passing it to beforeValidate (Payload hashes it first and
    // hands the hooks the stored record), so the rules are checked here, on the password itself
    beforeOperation: [
      async ({ args, operation, req }) => {
        // A refresh extends a session by STAFF_IDLE_SECONDS; none is given once that would carry
        // it past STAFF_ABSOLUTE_SECONDS from sign-in
        if (operation === 'refresh') {
          const user = req.user as { _sid?: string; sessions?: { id: string; createdAt: string }[] }
          const session = user?.sessions?.find((s) => s.id === user._sid)
          const age = session ? Date.now() - new Date(session.createdAt).getTime() : 0
          if (age > (STAFF_ABSOLUTE_SECONDS - STAFF_IDLE_SECONDS) * 1000) {
            throw publicError(
              'Your session has reached its 12-hour limit. Please sign in again.',
              401,
            )
          }
          return args
        }
        // Reset emails: a few an hour for each address and each IP, on top of Payload's 15 seconds
        // between requests for one account. Counted whether or not the address has an account, and
        // refused with the same words either way, so the limit reveals nothing
        if (operation === 'forgotPassword' && req.payloadAPI !== 'local') {
          const email = normaliseEmail(
            String((args as { data?: { email?: unknown } }).data?.email ?? ''),
          )
          for (const limit of [
            { scope: 'staff-reset-address', subject: email, max: 3 },
            { scope: 'staff-reset-ip', subject: clientIp(req.headers), max: 10 },
          ]) {
            const result = await hitLimit(req.payload, { ...limit, windowSeconds: 3600 })
            if (!result.allowed) {
              throw publicError('Too many reset requests. Please try again in an hour.', 429)
            }
          }
          return args
        }
        if (operation !== 'resetPassword') return args
        const password = (args as { data?: { password?: unknown; token?: unknown } }).data?.password
        if (typeof password !== 'string') return args
        const token = (args as { data?: { token?: unknown } }).data?.token
        const owner =
          typeof token === 'string' && token
            ? ((await req.payload.db.findOne({
                collection: 'users',
                where: { resetPasswordToken: { equals: token } },
                req,
              })) as { email?: string } | null)
            : null
        await checkStaffPassword(password, owner?.email, req.payload.logger)
        return args
      },
    ],
    beforeValidate: [
      async ({ data, req, context }) => {
        if (!data) return data
        // Erasing an account writes a placeholder address and a password nobody knows
        if (context.erasing) return data

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
          await checkStaffPassword(data.password, data.email ?? req.user?.email, req.payload.logger)
        }

        return data
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req, context }) => {
        if (!context.erasing) {
          if (originalDoc?.status === 'erased') {
            throw publicError('This account has been deleted; it cannot change.', 409)
          }
          if (data.status === 'erased') {
            throw publicError('Use "Delete this person" to delete an account.', 400)
          }
        }
        if (operation === 'create') {
          const { executeIn } = await import('../../utilities/sql')
          const { sql } = await import('@payloadcms/db-postgres')
          const [row] = await executeIn<{ n: string }>(
            req.payload,
            req,
            sql`SELECT nextval('staff_ref_seq') AS n`,
          )
          data.staffRef = `ST-${String(row.n).padStart(4, '0')}`
        }
        return data
      },
    ],
    afterChange: [
      // Who can do what is the most sensitive thing in the admin: every new account and every
      // change to someone's roles, brands or status goes in the security log, with who did it
      async ({ doc, previousDoc, operation, req, context }) => {
        if (context.erasing) return doc
        const actor = (req.user as { id?: number; email?: string } | null) ?? null
        const by = actor?.email ? ` by ${actor.email}` : ' by the server'
        const brands = (u: unknown) =>
          ((u as { tenants?: { tenant?: unknown }[] } | null)?.tenants ?? [])
            .map((t) =>
              typeof t.tenant === 'object' ? (t.tenant as { id?: number })?.id : t.tenant,
            )
            .filter(Boolean)
            .sort()
            .join(',')
        if (operation === 'create') {
          await logSecurityEvent(req.payload, {
            event: 'staff-account-created',
            email: doc.email,
            subject: doc.staffRef ?? undefined,
            actor: actor?.id ?? null,
            detail: `Roles ${(doc.roles ?? []).join(', ')}; ${doc.status}${by}`,
            req,
          })
          return doc
        }
        const changes = [
          (doc.roles ?? []).join(',') !== (previousDoc?.roles ?? []).join(',') &&
            `roles ${(previousDoc?.roles ?? []).join(', ') || 'none'} → ${(doc.roles ?? []).join(', ')}`,
          doc.status !== previousDoc?.status && `status ${previousDoc?.status} → ${doc.status}`,
          brands(doc) !== brands(previousDoc) &&
            `brands ${brands(previousDoc) || 'none'} → ${brands(doc) || 'none'}`,
        ].filter(Boolean)
        if (changes.length) {
          await logSecurityEvent(req.payload, {
            event: 'staff-account-changed',
            email: doc.email,
            subject: doc.staffRef ?? undefined,
            actor: actor?.id ?? null,
            detail: `${changes.join('; ')}${by}`,
            req,
          })
        }
        return doc
      },
    ],
    afterLogin: [
      async ({ req, user }) => {
        if (req.payloadAPI === 'local') return user
        // Within the sign-in's own transaction, which still holds the account's row
        await logSecurityEvent(req.payload, {
          event: 'staff-signed-in',
          email: user.email,
          ip: clientIp(req.headers),
          actor: user.id,
          req,
        })
        return user
      },
    ],
    // Wrong passwords and locked accounts reach here as errors from the sign-in endpoint. A lock
    // is logged and the account holder emailed once per lock, however many tries follow it
    afterError: [
      async ({ error, req }) => {
        const email = loginAttempt(req)
        if (!email) return
        const ip = clientIp(req.headers)
        const name = (error as { name?: string })?.name
        if (name === 'AuthenticationError') {
          await logSecurityEvent(req.payload, { event: 'staff-sign-in-failed', email, ip })
        }
        if (name !== 'LockedAuth' && name !== 'AuthenticationError') return
        const user = (
          await req.payload.find({
            collection: 'users',
            where: { email: { equals: email } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
            showHiddenFields: true,
          })
        ).docs[0] as { id: number; email: string; lockUntil?: string | null } | undefined
        const lockUntil = user?.lockUntil ? new Date(user.lockUntil).getTime() : 0
        if (!user || lockUntil <= Date.now()) return
        const lockedSince = new Date(lockUntil - LOCK_MINUTES * 60 * 1000).toISOString()
        const told = await req.payload.count({
          collection: 'security-events',
          where: {
            and: [
              { event: { equals: 'staff-locked' } },
              { email: { equals: user.email } },
              { createdAt: { greater_than_equal: lockedSince } },
            ],
          },
          overrideAccess: true,
        })
        if (told.totalDocs > 0) return
        await logSecurityEvent(req.payload, {
          event: 'staff-locked',
          email: user.email,
          ip,
          detail: `${MAX_LOGIN_ATTEMPTS} wrong passwords; locked for ${LOCK_MINUTES} minutes`,
        })
        await notifyStaffLockout(req.payload, { email: user.email, minutes: LOCK_MINUTES })
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
  endpoints: [
    {
      // GET /api/users/:id/erase: what deleting the account would do. POST { confirm, reason }:
      // do it. Super admins only; logged (src/people/erase.ts)
      path: '/:id/erase',
      method: 'get',
      handler: async (req) => {
        if (!isSuperAdmin(req.user)) return refuse(req, 'Only a super admin can do this.')
        const user = await req.payload
          .findByID({ collection: 'users', id: Number(req.routeParams?.id), overrideAccess: true })
          .catch(() => null)
        if (!user) return Response.json({ message: 'There is no such account.' }, { status: 404 })
        const { staffPlaceholder } = await import('../../people/erase')
        return Response.json({
          erased: user.status === 'erased',
          confirm: user.staffRef,
          placeholder: user.staffRef ? staffPlaceholder(user.staffRef) : null,
          self: user.id === req.user?.id,
        })
      },
    },
    {
      path: '/:id/erase',
      method: 'post',
      handler: async (req) => {
        if (!isSuperAdmin(req.user)) return refuse(req, 'Only a super admin can do this.')
        const body = (await req.json?.().catch(() => ({}))) as { confirm?: string; reason?: string }
        const { ErasureError, eraseStaff } = await import('../../people/erase')
        try {
          const result = await eraseStaff(req.payload, {
            userId: Number(req.routeParams?.id),
            actor: req.user as never,
            confirm: body?.confirm,
            reason: body?.reason,
          })
          return Response.json({ ok: true, ...result })
        } catch (error) {
          if (error instanceof ErasureError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Deleting a staff account failed' })
          return Response.json(
            { message: 'The account could not be deleted. Nothing has changed; please try again.' },
            { status: 500 },
          )
        }
      },
    },
  ],
  timestamps: true,
}
