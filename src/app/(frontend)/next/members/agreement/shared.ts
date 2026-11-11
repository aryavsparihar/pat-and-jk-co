import { AGREEMENTS, type AgreementDocument } from '@/agreements/documents'
import { AgreementError, checkMemberId } from '@/agreements/service'
import { KycError } from '@/kyc/service'
import { reply } from '@/members/http'
import type { Member } from '@/payload-types'

/** The agreement asked about, and the member's own ID for it, checked; or the reply refusing */
export const agreementFor = (
  member: Member,
  kind: unknown,
  memberId: unknown,
): { agreement: AgreementDocument } | { refused: Response } => {
  const agreement = AGREEMENTS[kind === 'partner' ? 'partner' : 'artist']
  if (kind !== 'artist' && kind !== 'partner')
    return { refused: reply({ message: 'Which agreement?' }, { status: 400 }) }
  try {
    checkMemberId(member, agreement, memberId)
    return { agreement }
  } catch (error) {
    return { refused: agreementProblem(error)! }
  }
}

/** What the member is told when signing goes wrong; null for an unexpected error */
export const agreementProblem = (error: unknown): Response | null =>
  error instanceof AgreementError || error instanceof KycError
    ? reply({ message: error.message }, { status: error.status })
    : null
