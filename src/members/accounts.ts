import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'

import type { Application, Member } from '@/payload-types'

import type { MemberKind } from './ids'
import { newApplicationReference } from './ids'

/**
 * Creates an applicant: a member record (no member ID yet; that comes on approval) and their draft
 * application, in one transaction, so there is never a member without an application or the other
 * way round. A clash on the random reference is retried with a fresh one.
 */
export const startApplication = async (
  payload: Payload,
  { email, type }: { email: string; type: MemberKind },
): Promise<{ member: Member; application: Application }> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      const member = await payload.create({
        collection: 'members',
        data: { email, type, standing: 'applicant' },
        overrideAccess: true,
        req,
        context: { disableRevalidate: true },
      })
      const application = await payload.create({
        collection: 'applications',
        data: { reference: newApplicationReference(), member: member.id, type, stage: 'draft' },
        overrideAccess: true,
        req,
        context: { disableRevalidate: true },
      })
      await commitTransaction(req)
      return { member, application }
    } catch (error) {
      await killTransaction(req)
      const clash = /reference/i.test(String((error as Error)?.message))
      if (!clash || attempt === 4) throw error
    }
  }
  throw new Error('Could not create an application reference')
}

/** The member for an email address, if there is one */
export const findMember = async (payload: Payload, email: string): Promise<Member | null> => {
  const found = await payload.find({
    collection: 'members',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}
