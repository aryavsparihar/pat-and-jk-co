import type { Payload, Where } from 'payload'

import { deleteSealed } from '@/contact/store'
import type { Application } from '@/payload-types'

/**
 * How long applications not taken forward are kept (the founder's brief of 25 November 2026,
 * section 11): deleted within 90 days, except a guest curator who asked us to keep theirs on
 * file, which goes after 12 months. Runs with the weekly purge (src/app/(frontend)/next/cron).
 *
 *   artist and trade   declined or withdrawn 90 days ago, or a draft untouched for 90 days
 *   guest curator      "Not this time" 90 days ago; "On file" 12 months after we wrote
 *
 * Approved applications, and anything still being read, are never touched. The application goes
 * with its pictures and files; the person's account stays, so they can sign in and apply again.
 * Identity details follow their own rules (src/kyc/service.ts, RETENTION).
 */
export const APPLICATION_RETENTION = {
  notTakenForwardDays: 90,
  curatorOnFileDays: 365,
} as const

const DAY = 86_400_000

export type ApplicationDue = { id: number; reference: string; reason: string }

export const applicationsDue = async (
  payload: Payload,
  now = new Date(),
): Promise<ApplicationDue[]> => {
  const before = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
  const notForward = before(APPLICATION_RETENTION.notTakenForwardDays)
  const onFile = before(APPLICATION_RETENTION.curatorOnFileDays)
  const member = { type: { in: ['artist', 'partner'] } }
  const curator = { type: { equals: 'curator' } }
  const rules: { reason: string; where: Where }[] = [
    {
      reason: 'declined over 90 days ago',
      where: {
        and: [member, { stage: { equals: 'rejected' } }, { decidedAt: { less_than: notForward } }],
      },
    },
    {
      reason: 'withdrawn over 90 days ago',
      where: {
        and: [
          member,
          { stage: { equals: 'withdrawn' } },
          { withdrawnAt: { less_than: notForward } },
        ],
      },
    },
    {
      reason: 'a draft untouched for 90 days',
      where: {
        and: [member, { stage: { equals: 'draft' } }, { updatedAt: { less_than: notForward } }],
      },
    },
    {
      reason: 'a curator we declined over 90 days ago',
      where: {
        and: [
          curator,
          { curatorStatus: { equals: 'not-this-time' } },
          { decidedAt: { less_than: notForward } },
        ],
      },
    },
    {
      reason: 'a curator kept on file for 12 months',
      where: {
        and: [
          curator,
          { curatorStatus: { equals: 'on-file' } },
          { decidedAt: { less_than: onFile } },
        ],
      },
    },
  ]
  const due = new Map<number, ApplicationDue>()
  for (const rule of rules) {
    const found = await payload.find({
      collection: 'applications',
      where: rule.where,
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
      select: { reference: true },
    })
    for (const doc of found.docs)
      if (!due.has(doc.id))
        due.set(doc.id, { id: doc.id, reference: doc.reference, reason: rule.reason })
  }
  return [...due.values()]
}

/** Deletes one application with its pictures and files */
const removeApplication = async (payload: Payload, id: number) => {
  const application = (await payload.findByID({
    collection: 'applications',
    id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })) as Application
  const pictures = (application.portfolio ?? [])
    .map((work) => (typeof work.image === 'object' ? work.image?.id : work.image))
    .filter((picture): picture is number => typeof picture === 'number')
  await payload.delete({
    collection: 'applications',
    id,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  if (pictures.length)
    await payload.delete({
      collection: 'portfolio-images',
      where: { id: { in: pictures } },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  // A curator's portfolio and CV are sealed in storage, not in the database
  if (application.curatorFiles?.length) await deleteSealed(application.curatorFiles)
}

/** Applies the rules above; one failure is reported and tried again next week */
export const runApplicationPurge = async (payload: Payload, now = new Date()) => {
  const due = await applicationsDue(payload, now)
  let deleted = 0
  let failed = 0
  for (const application of due) {
    try {
      await removeApplication(payload, application.id)
      deleted++
    } catch (error) {
      failed++
      payload.logger.error({
        err: error,
        msg: `Could not delete application ${application.reference} (${application.reason})`,
      })
    }
  }
  return { deleted, failed }
}
