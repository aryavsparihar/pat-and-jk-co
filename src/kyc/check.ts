import 'server-only'

import type { Payload } from 'payload'

import type { KycRecord, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'
import { actingFor } from '@/security/audit'

import { KycError } from './service'

/**
 * The team's check of who someone is, after approval (founder's brief of 25 November 2026,
 * section 11): "Agreement ready to sign" unlocks only once the team marks identity as checked.
 *
 *   sent for checking   the member sent "Confirm who you are" (identityCheck.sentAt)
 *   checked             a KYC reviewer looked at the documents and marked it so; the agreement
 *                       unlocks and the member is emailed
 *   sent back           the reviewer needs something more: the member is told what, in a note,
 *                       and can change their details and send them again
 *
 * Any new details the member sends clear an earlier check (src/kyc/service.ts, saveIdentity).
 */

export const identityChecked = (record: Pick<KycRecord, 'identityCheck'> | null | undefined) =>
  Boolean(record?.identityCheck?.checkedAt)

export const identitySent = (record: Pick<KycRecord, 'identityCheck'> | null | undefined) =>
  Boolean(record?.identityCheck?.sentAt)

const load = async (payload: Payload, recordId: number) => {
  const record = await payload
    .findByID({ collection: 'kyc-records', id: recordId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!record) throw new KycError('That record could not be found.', 404)
  const memberId = typeof record.member === 'object' ? record.member.id : record.member
  const member = await payload.findByID({
    collection: 'members',
    id: memberId,
    depth: 0,
    overrideAccess: true,
  })
  return { record, member }
}

/** Which approved applications, not yet signed, this check unlocks the agreement for */
const waitingKinds = async (payload: Payload, memberId: number) => {
  const found = await payload.find({
    collection: 'applications',
    where: { and: [{ member: { equals: memberId } }, { stage: { equals: 'approved' } }] },
    depth: 0,
    limit: 10,
    overrideAccess: true,
  })
  return [...new Set(found.docs.map((a) => a.type))].filter(
    (t): t is 'artist' | 'partner' => t === 'artist' || t === 'partner',
  )
}

export const markIdentityChecked = async (
  payload: Payload,
  { recordId, actor }: { recordId: number; actor: User },
) => {
  const { record, member } = await load(payload, recordId)
  if (!identitySent(record))
    throw new KycError('These details have not been sent for checking yet.', 409)
  if (identityChecked(record)) throw new KycError('These details are already checked.', 409)
  const updated = await payload.update({
    collection: 'kyc-records',
    id: record.id,
    data: {
      identityCheck: {
        sentAt: record.identityCheck?.sentAt,
        checkedAt: new Date().toISOString(),
        checkedBy: actor.id,
      },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(actor, 'users') },
  })
  await logSecurityEvent(payload, {
    event: 'kyc-identity-checked',
    actor: actor.id,
    email: member.email,
    subject: record.reference ?? undefined,
    detail: `Checked by ${actor.email}`,
  })
  const kinds = await waitingKinds(payload, member.id)
  const { sendAgreementReady } = await import('@/members/emails')
  const emailed = kinds.length ? await sendAgreementReady(payload, { member, kinds }) : true
  return { record: updated, emailed }
}

export const returnIdentity = async (
  payload: Payload,
  { recordId, actor, note }: { recordId: number; actor: User; note: unknown },
) => {
  const text = String(note ?? '').trim().slice(0, 2000)
  if (!text) throw new KycError('Write a note saying what is needed.', 400)
  const { record, member } = await load(payload, recordId)
  if (!identitySent(record) || identityChecked(record))
    throw new KycError('Only details waiting to be checked can be sent back.', 409)
  const updated = await payload.update({
    collection: 'kyc-records',
    id: record.id,
    data: { identityCheck: { sentAt: null, checkedAt: null, checkedBy: null } } as never,
    overrideAccess: true,
    context: { disableRevalidate: true, ...actingFor(actor, 'users') },
  })
  await logSecurityEvent(payload, {
    event: 'kyc-identity-returned',
    actor: actor.id,
    email: member.email,
    subject: record.reference ?? undefined,
    detail: `Sent back by ${actor.email}`,
  })
  const { sendIdentityReturned } = await import('@/members/emails')
  const emailed = await sendIdentityReturned(payload, { member, note: text })
  return { record: updated, emailed }
}

/**
 * The approved application whose identity can be given now: approved, and the details not yet
 * sent for checking (or sent back). Null outside that window.
 */
export const openForChecking = async (
  payload: Payload,
  member: { id: number },
  kind: 'artist' | 'partner',
) => {
  const { findOwnApplication } = await import('@/members/application')
  const application = await findOwnApplication(payload, member as never, kind, 0)
  if (!application || application.stage !== 'approved') return null
  const record = (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  return identitySent(record) || identityChecked(record) ? null : application
}
