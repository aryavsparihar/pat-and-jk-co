import type { Payload } from 'payload'

import { AGREEMENTS, type AgreementDocument } from '@/agreements/documents'
import { AgreementError, checkSigner } from '@/agreements/service'
import { KycError } from '@/kyc/service'
import { reply } from '@/members/http'
import type { Member } from '@/payload-types'

/** The agreement asked about, if this member may sign it now; or the reply refusing */
export const agreementFor = async (
  payload: Payload,
  member: Member,
  kind: unknown,
): Promise<{ agreement: AgreementDocument } | { refused: Response }> => {
  if (kind !== 'artist' && kind !== 'partner')
    return { refused: reply({ message: 'Which agreement?' }, { status: 400 }) }
  const agreement = AGREEMENTS[kind]
  try {
    await checkSigner(payload, member, agreement)
    return { agreement }
  } catch (error) {
    const problem = agreementProblem(error)
    if (problem) return { refused: problem }
    throw error
  }
}

/** What the member is told when signing goes wrong; null for an unexpected error */
export const agreementProblem = (error: unknown): Response | null =>
  error instanceof AgreementError || error instanceof KycError
    ? reply({ message: error.message }, { status: error.status })
    : null
