// @vitest-environment node
import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureApplication } from '@/members/accounts'
import type { User } from '@/payload-types'
import { execute } from '@/utilities/sql'

import { appRolePayload, appRoleUrl } from '../helpers/appRole'

/*
 * Deleting people, as the live site's own database role does it (tests/helpers/appRole.ts), not
 * as the database's owner, which no permission or policy ever stops. Everyone here is made up
 * (@deletion.example.test, @pjk.co.in staff named "Deletion test") and everything is removed.
 */

let owner: Payload
let app: Payload
const DOMAIN = '@deletion.example.test'
const tag = () => randomBytes(4).toString('hex')
const password = () => `${randomBytes(18).toString('base64url')}-Aa1!`

const staffMember = (roles: string[]) =>
  owner.create({
    collection: 'users',
    data: {
      name: 'Deletion test',
      email: `deletion-${tag()}@pjk.co.in`,
      password: password(),
      roles,
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as Promise<User>

const asStaff = (user: User) => ({ ...user, collection: 'users' }) as never

const cleanup = async () => {
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like}`
  await execute(owner, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(owner, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(owner, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(owner, sql`DELETE FROM security_events WHERE email LIKE 'deletion-%@pjk.co.in'`)
  await execute(owner, sql`DELETE FROM users WHERE name = 'Deletion test'`)
}

beforeAll(async () => {
  owner = await getPayload({ config: await config })
  if (appRoleUrl()) app = await appRolePayload()
  await cleanup()
})

afterAll(async () => {
  await cleanup()
})

describe.skipIf(!appRoleUrl())('deleting people, as the live site’s database role', () => {
  it('connects as a role that cannot bypass Row-Level Security', async () => {
    const [row] = await execute<{ bypass: boolean; superuser: boolean }>(
      app,
      sql`SELECT rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`,
    )
    expect(row).toEqual({ bypass: false, superuser: false })
  })

  it('a super admin can delete a member of staff, and the security log keeps its entries', async () => {
    const admin = await staffMember(['super-admin'])
    const editor = await staffMember(['editor'])
    const event = await owner.create({
      collection: 'security-events',
      data: { event: 'staff-signed-in', email: editor.email, actor: editor.id },
      overrideAccess: true,
    })

    await app.delete({
      collection: 'users',
      id: editor.id,
      overrideAccess: false,
      user: asStaff(admin),
    })

    const kept = await owner.findByID({
      collection: 'security-events',
      id: event.id,
      depth: 0,
      overrideAccess: true,
    })
    expect(kept.email).toBe(editor.email)
  })

  it('removing a member’s row outright is refused by the database: their application needs it', async () => {
    // The cause of "Something went wrong" when a member was deleted in the admin: every member has
    // an application, which must belong to someone, so the row cannot simply go
    const { member } = await ensureApplication(owner, {
      email: `artist-${tag()}${DOMAIN}`,
      type: 'artist',
    })
    await expect(
      app.db.deleteOne({ collection: 'members', where: { id: { equals: member.id } } }),
    ).rejects.toMatchObject({
      cause: { code: '23502', table: 'applications', column: 'member_id' },
    })
  })

  it('the admin no longer offers to delete a member outright, and nothing is lost', async () => {
    const admin = await staffMember(['super-admin'])
    for (const type of ['artist', 'partner'] as const) {
      const { member, application } = await ensureApplication(owner, {
        email: `${type}-${tag()}${DOMAIN}`,
        type,
      })
      await expect(
        app.delete({
          collection: 'members',
          id: member.id,
          overrideAccess: false,
          user: asStaff(admin),
        }),
      ).rejects.toMatchObject({ status: 403 })
      const still = await owner.findByID({
        collection: 'applications',
        id: application.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(still.member).toBe(member.id)
    }
  })
})
