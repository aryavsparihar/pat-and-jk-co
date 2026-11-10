import { publicError } from '@/utilities/publicError'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import type { Application, Member, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'

import { sendDecisionEmail } from './emails'
import { reapplyDays, reapplyFrom } from './reapply'
import { newMemberId, type MemberKind } from './ids'

/**
 * Staff decisions on an application: start reviewing it, approve, reject, or ask for changes.
 *
 * Approval is the one place a member ID is issued. Everything that must happen together happens
 * in one database transaction: take the next number from the kind's sequence, write the member ID
 * and approved standing onto the member, and mark the application approved. If any step fails the
 * whole approval rolls back (the sequence number is simply skipped; gaps are expected). Only after
 * the transaction commits is the applicant emailed and the decision written to the security log,
 * so nobody is ever told about an approval that did not happen.
 */

export type Decision = 'review' | 'approve' | 'reject' | 'request-changes'

export const DECISIONS: readonly Decision[] = ['review', 'approve', 'reject', 'request-changes']

const STAGE_AFTER: Record<Decision, Application['stage']> = {
  review: 'under-review',
  approve: 'approved',
  reject: 'rejected',
  'request-changes': 'changes-requested',
}

/** Which stages each decision may be taken from (within src/members/stages.ts) */
const ALLOWED_FROM: Record<Decision, Application['stage'][]> = {
  review: ['submitted'],
  approve: ['submitted', 'under-review'],
  reject: ['submitted', 'under-review', 'changes-requested'],
  'request-changes': ['submitted', 'under-review'],
}

const EVENT: Record<
  Decision,
  | 'application-under-review'
  | 'application-approved'
  | 'application-rejected'
  | 'application-changes-requested'
> = {
  review: 'application-under-review',
  approve: 'application-approved',
  reject: 'application-rejected',
  'request-changes': 'application-changes-requested',
}

/**
 * Draws a new random member ID of a kind (AT-X63G8) that no one has, deleted people included.
 * Must be called inside the approval transaction. With 20 million IDs of each kind a clash is
 * rare; ten in a row means something is wrong, so the approval stops rather than loop.
 */
export const nextMemberId = async (
  payload: Payload,
  req: PayloadRequest,
  kind: MemberKind,
): Promise<string> => {
  const field = kind === 'artist' ? 'artistId' : 'partnerId'
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = newMemberId(kind)
    const taken = await payload.count({
      collection: 'members',
      where: { [field]: { equals: candidate } },
      overrideAccess: true,
      req,
    })
    if (taken.totalDocs === 0) return candidate
  }
  throw new Error(`Could not find an unused ${kind} member ID`)
}

export type DecisionResult = { application: Application; member: Member; memberId?: string }

export const decideApplication = async (
  payload: Payload,
  {
    applicationId,
    decision,
    note,
    actor,
  }: { applicationId: number; decision: Decision; note?: string | null; actor: User },
): Promise<DecisionResult> => {
  const req = await createLocalReq({ user: { ...actor, collection: 'users' } as never }, payload)
  await initTransaction(req)

  let result: DecisionResult
  try {
    const application = await payload.findByID({
      collection: 'applications',
      id: applicationId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (!ALLOWED_FROM[decision].includes(application.stage)) {
      throw publicError(
        `An application that is "${application.stage}" cannot be given that decision.`,
        409,
      )
    }
    const cleanNote = (note ?? '').trim().slice(0, 4000) || null
    if ((decision === 'reject' || decision === 'request-changes') && !cleanNote) {
      throw publicError('Write a note to the applicant explaining the decision.', 400)
    }

    const memberRef = application.member
    const memberId = typeof memberRef === 'object' ? memberRef.id : memberRef
    let member = await payload.findByID({
      collection: 'members',
      id: memberId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    // The ID slot this kind of application fills: an artist approval never touches a partner ID
    const slot = application.type === 'artist' ? 'artistId' : 'partnerId'
    let issued: string | undefined
    let earned: string | null = null
    if (decision === 'approve') {
      const data: Partial<Member> =
        application.type === 'artist'
          ? { artistApprovedAt: new Date().toISOString() }
          : {
              partnerApprovedAt: new Date().toISOString(),
              partnerCategory: application.partnerCategory ?? member.partnerCategory,
            }
      // Someone already approved as this kind keeps the ID they were given
      earned = member[slot] ?? null
      if (!earned) {
        issued = await nextMemberId(payload, req, application.type)
        data[slot] = issued
        earned = issued
      }
      member = await payload.update({
        collection: 'members',
        id: member.id,
        data,
        overrideAccess: true,
        req,
        context: { issuingMemberId: slot, disableRevalidate: true },
      })
    }

    const updated = await payload.update({
      collection: 'applications',
      id: application.id,
      data: {
        stage: STAGE_AFTER[decision],
        // Starting the review is not a decision: nothing else changes, and nobody is emailed
        ...(decision === 'review'
          ? {}
          : {
              decisionNote: cleanNote,
              decidedAt: new Date().toISOString(),
              decidedBy: actor.id,
            }),
        // A decline says when they may apply again
        ...(decision === 'reject' ? { reapplyFrom: reapplyFrom(await reapplyDays(payload)) } : {}),
        ...(earned ? { issuedId: earned } : {}),
      },
      overrideAccess: true,
      req,
      context: { decidingApplication: true, disableRevalidate: true },
    })

    await commitTransaction(req)
    result = { application: updated, member, memberId: issued }
  } catch (error) {
    await killTransaction(req)
    throw error
  }

  // After the commit: tell the applicant, and record who decided what
  await logSecurityEvent(payload, {
    event: EVENT[decision],
    email: result.member.email,
    actor: actor.id,
    subject: result.application.issuedId ?? result.application.reference,
    detail: `${result.application.reference} ${STAGE_AFTER[decision]} by ${actor.email}`,
  })
  if (result.memberId) {
    await logSecurityEvent(payload, {
      event: 'member-id-issued',
      email: result.member.email,
      actor: actor.id,
      subject: result.memberId,
      detail: result.application.reference,
    })
  }
  if (decision !== 'review') {
    await sendDecisionEmail(payload, {
      decision,
      application: result.application,
      member: result.member,
    })
  }

  return result
}
