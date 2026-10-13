// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { saveKyc, storeKycDocument } from '@/kyc/service'
import { ensureApplication } from '@/members/accounts'
import type { User } from '@/payload-types'
import { createSession, readSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { FAKE, goodKyc, removeKycFor } from '../helpers/kyc'

/*
 * A member who has lost access to their email: only a KYC reviewer changes the address, only for a
 * member with identity details on file, with a reason; everything is logged and both addresses
 * are told. Everyone here is made up (@recovery.example.test).
 */

let payload: Payload
const DOMAIN = '@recovery.example.test'
let reviewer: User
let editor: User

const staffUser = async (email: string, roles: string[]) =>
  (
    await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      overrideAccess: true,
    })
  ).docs[0] ??
  (await payload.create({
    collection: 'users',
    data: {
      email,
      name: 'Recovery test',
      roles: roles as never,
      status: 'active',
      password: 'Rw8-quiet-Forest-2026!',
    },
    overrideAccess: true,
  }))

const changeEmail = (user: unknown, id: number, body: object) =>
  payload.collections.members.config.endpoints
    ? (payload.collections.members.config.endpoints || [])
        .find((e) => e.path === '/:id/change-email')!
        .handler({
          user,
          payload,
          routeParams: { id: String(id) },
          json: async () => body,
        } as never)
    : null!

const member = async (withKyc: boolean) => {
  const email = `artist-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`
  const { member, application } = await ensureApplication(payload, { email, type: 'artist' })
  if (withKyc) {
    const passport = await storeKycDocument(payload, {
      member,
      kind: 'other-id',
      bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
    })
    await saveKyc(payload, {
      member,
      reference: application.reference,
      consent: { noticeVersion: 'test', confirmation: 'test' },
      input: { ...goodKyc({ 'other-id': passport.id }), pan: FAKE.pan } as never,
    })
  }
  return member
}

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await removeKycFor(payload, like)
  await execute(
    payload,
    sql`DELETE FROM member_sessions WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(
    payload,
    sql`DELETE FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  reviewer = await staffUser('recovery-reviewer-test@pjk.co.in', ['kyc-reviewer'])
  editor = await staffUser('recovery-editor-test@pjk.co.in', ['editor'])
})
afterAll(() => cleanup())

describe('changing a member’s email address for them', () => {
  it('cannot be done by editing the record, by anyone', async () => {
    const m = await member(false)
    const edited = await payload.update({
      collection: 'members',
      id: m.id,
      data: { email: `taken-over${DOMAIN}` },
      user: { ...reviewer, roles: ['super-admin'], collection: 'users' } as never,
      overrideAccess: false,
    })
    expect(edited.email).toBe(m.email)
  })

  it('is for KYC reviewers only, with a reason, and a record to check against', async () => {
    const without = await member(false)
    expect(
      (
        await changeEmail({ ...editor, collection: 'users' }, without.id, {
          email: `n1${DOMAIN}`,
          reason: 'Checked on the phone.',
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await changeEmail({ ...reviewer, collection: 'users' }, without.id, {
          email: `n1${DOMAIN}`,
          reason: 'short',
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await changeEmail({ ...reviewer, collection: 'users' }, without.id, {
          email: `n1${DOMAIN}`,
          reason: 'Checked against the KYC record on file.',
        })
      ).status,
    ).toBe(409)
  })

  it('changes the address, ends every session, logs who and why, and tells both addresses', async () => {
    const m = await member(true)
    const { value } = await createSession(payload, { memberId: m.id })
    const info = vi.spyOn(payload.logger, 'info')
    const next = `found-again${DOMAIN}`
    const response = await changeEmail({ ...reviewer, collection: 'users' }, m.id, {
      email: next,
      reason: 'Phoned the number on file; name, date of birth and PAN match the KYC record.',
    })
    expect(response.status).toBe(200)
    const after = await payload.findByID({ collection: 'members', id: m.id, overrideAccess: true })
    expect(after.email).toBe(next)
    expect(await readSession(payload, value)).toBeNull()
    const logged = await payload.find({
      collection: 'security-events',
      where: { and: [{ event: { equals: 'member-email-changed' } }, { email: { equals: next } }] },
      overrideAccess: true,
    })
    expect(logged.docs[0]?.detail).toMatch(
      /recovery-reviewer-test@pjk\.co\.in after an identity check: Phoned/,
    )
    const sent = info.mock.calls.map((c) => String(c[0]))
    expect(sent.some((m) => m.includes('The email address on your PJK account has changed'))).toBe(
      true,
    )
    expect(sent.some((m) => m.includes('Your PJK account now uses this email address'))).toBe(true)
    info.mockRestore()
  })
})
