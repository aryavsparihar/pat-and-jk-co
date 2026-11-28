import { publicError } from '@/utilities/publicError'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import type { Application, Member, User } from '@/payload-types'
import { logSecurityEvent } from '@/security/events'

import { sendDecisionEmail } from './emails'
import { idFieldOf } from './issueId'
import { reapplyDays, reapplyFrom } from './reapply'

/**
 * Staff decisions on an application: start reviewing it, approve, reject, or ask for changes.
 *
 * Approval does not issue a member ID (founder's brief of 25 November 2026). An approved applicant
 * is asked to confirm who they are (/account/verify); once the team has checked it, the agreement
 * unlocks, and the ID is issued when it is signed (src/members/issueId.ts). What must happen
 * together happens in one database transaction: the approval date on the member and the stage on
 * the application. Only after it commits is the applicant emailed and the decision logged, so
 * nobody is ever told about an approval that did not happen.
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

export type DecisionResult = { application: Application; member: Member }

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

    // A guest curator is followed on the Curators screen, with its own emails; no member ID
    if (application.type === 'curator' || !application.member) {
      throw publicError('A guest curator’s application is answered from the Curators screen.', 409)
    }
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
    const memberId = typeof memberRef === 'object' ? memberRef!.id : memberRef!
    let member = await payload.findByID({
      collection: 'members',
      id: memberId,
      depth: 0,
      overrideAccess: true,
      req,
    })

    if (decision === 'approve') {
      const data: Partial<Member> =
        application.type === 'artist'
          ? { artistApprovedAt: new Date().toISOString() }
          : {
              partnerApprovedAt: new Date().toISOString(),
              partnerCategory: application.partnerCategory ?? member.partnerCategory,
            }
      member = await payload.update({
        collection: 'members',
        id: member.id,
        data,
        overrideAccess: true,
        req,
        context: { disableRevalidate: true },
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
        // Someone already holding an ID of this kind (applying again) is known by it
        ...(decision === 'approve' && member[idFieldOf(application.type)]
          ? { issuedId: member[idFieldOf(application.type)] }
          : {}),
      },
      overrideAccess: true,
      req,
      context: { decidingApplication: true, disableRevalidate: true },
    })

    await commitTransaction(req)
    result = { application: updated, member }
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
  if (decision !== 'review') {
    await sendDecisionEmail(payload, {
      decision,
      application: result.application,
      member: result.member,
    })
  }

  return result
}
