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
 * Makes sure someone has an application of a kind: creating their member record if this is the
 * first thing they have ever applied for, and a draft application of that kind if they have none.
 * Someone who is already an approved artist and now applies as a partner keeps their one record
 * and sign-in, and gains a second application. Both writes happen in one transaction, so there is
 * never a member without the application they came for. A clash on the random reference is retried.
 */
export const ensureApplication = async (
  payload: Payload,
  { email, type }: { email: string; type: MemberKind },
): Promise<{
  member: Member
  application: Application
  createdMember: boolean
  createdApplication: boolean
}> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      let member = (
        await payload.find({
          collection: 'members',
          where: { email: { equals: email } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
      ).docs[0]
      const createdMember = !member
      member ??= await payload.create({
        collection: 'members',
        data: { email, standing: 'active' },
        overrideAccess: true,
        req,
        context: { disableRevalidate: true },
      })

      let application = (
        await payload.find({
          collection: 'applications',
          where: { and: [{ member: { equals: member.id } }, { type: { equals: type } }] },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })
      ).docs[0]
      const createdApplication = !application
      application ??= await payload.create({
        collection: 'applications',
        data: { reference: newApplicationReference(type), member: member.id, type, stage: 'draft' },
        overrideAccess: true,
        req,
        context: { disableRevalidate: true },
      })

      await commitTransaction(req)
      return { member, application, createdMember, createdApplication }
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
