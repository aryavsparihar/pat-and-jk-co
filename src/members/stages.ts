import type { Application } from '@/payload-types'

export type Stage = Application['stage']

/**
 * Where an application may go from each stage, and nowhere else. The Applications collection
 * checks every change of stage against this, whoever makes it (src/collections/Applications.ts).
 *
 *   draft             → submitted (the applicant sends it), withdrawn
 *   submitted         → under review (staff start reading), approved, changes requested,
 *                       declined, withdrawn
 *   under review      → approved, changes requested, declined, withdrawn
 *   changes requested → submitted (sent again), declined, withdrawn
 *   approved, declined, withdrawn: final. Someone declined or withdrawn applies again with a new
 *   application, which keeps its own reference and points back to this one (src/members/reapply.ts)
 */
export const TRANSITIONS: Record<Stage, readonly Stage[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under-review', 'approved', 'changes-requested', 'rejected', 'withdrawn'],
  'under-review': ['approved', 'changes-requested', 'rejected', 'withdrawn'],
  'changes-requested': ['submitted', 'rejected', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
}

export const canMove = (from: Stage, to: Stage): boolean =>
  from === to || TRANSITIONS[from]?.includes(to) === true

/** Stages the applicant may withdraw from */
export const WITHDRAWABLE: readonly Stage[] = (Object.keys(TRANSITIONS) as Stage[]).filter((s) =>
  TRANSITIONS[s].includes('withdrawn'),
)

/** Final stages: nothing more happens to the application itself */
export const FINAL: readonly Stage[] = ['approved', 'rejected', 'withdrawn']

/** What the applicant is told about where their application stands */
export const STAGE_WORDS: Record<Stage, string> = {
  draft: 'Not sent yet',
  submitted: 'Sent; waiting to be read',
  'under-review': 'Being read',
  'changes-requested': 'We have asked for a few changes',
  approved: 'Approved',
  rejected: 'Not accepted this time',
  withdrawn: 'Withdrawn by you',
}
