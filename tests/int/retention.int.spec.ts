// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureApplication } from '@/members/accounts'
import { newApplicationReference } from '@/members/ids'
import { applicationsDue, runApplicationPurge } from '@/retention/applications'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'

/*
 * Applications not taken forward are deleted within 90 days; a guest curator who asked to be kept
 * on file, after 12 months (the founder's brief, section 11). Approved applications and anything
 * still open are never touched. Everyone here is made up (@retention.example.test).
 */

let payload: Payload
let closeApplications: () => Promise<void>
const DOMAIN = '@retention.example.test'
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`

/** An artist's application at a stage, with its dates set as long ago as the test needs */
const artistAt = async (stage: string, days: number) => {
  const { application } = await ensureApplication(payload, {
    email: unique('artist'),
    type: 'artist',
  })
  await execute(
    payload,
    sql`UPDATE applications SET stage = ${stage}::enum_applications_stage,
        decided_at = ${ago(days)}, withdrawn_at = ${ago(days)}, updated_at = ${ago(days)},
        current_slot = NULL
        WHERE id = ${application.id}`,
  )
  return application.id
}

/** A guest curator's application, written to on a given day with the status the team chose */
const curatorAt = async (status: string, days: number) => {
  const reference = newApplicationReference('curator')
  const [row] = await execute<{ id: number }>(
    payload,
    sql`INSERT INTO applications (reference, type, stage, curator_email, curator_status, decided_at, created_at, updated_at)
        VALUES (${reference}, 'curator', 'rejected', ${unique('curator')}, ${status}, ${ago(days)}, ${ago(days)}, ${ago(days)})
        RETURNING id`,
  )
  return row!.id
}

const exists = async (id: number) =>
  (
    await payload.count({
      collection: 'applications',
      where: { id: { equals: id } },
      overrideAccess: true,
    })
  ).totalDocs === 1

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await execute(payload, sql`DELETE FROM applications WHERE curator_email LIKE ${like}`)
  await execute(
    payload,
    sql`DELETE FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(
    payload,
    sql`DELETE FROM member_sessions WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  closeApplications = await openApplicationsForTests(payload)
})

afterAll(async () => {
  await cleanup()
  await closeApplications()
})

describe('applications not taken forward', () => {
  it('go after 90 days, and nothing approved or still open is touched', async () => {
    const declinedLongAgo = await artistAt('rejected', 91)
    const declinedLately = await artistAt('rejected', 30)
    const withdrawnLongAgo = await artistAt('withdrawn', 120)
    const staleDraft = await artistAt('draft', 95)
    const freshDraft = await artistAt('draft', 10)
    const approvedLongAgo = await artistAt('approved', 400)
    const beingRead = await artistAt('submitted', 200)

    const due = new Map((await applicationsDue(payload)).map((d) => [d.id, d.reason]))
    expect(due.get(declinedLongAgo)).toMatch(/declined/)
    expect(due.get(withdrawnLongAgo)).toMatch(/withdrawn/)
    expect(due.get(staleDraft)).toMatch(/draft/)
    for (const kept of [declinedLately, freshDraft, approvedLongAgo, beingRead])
      expect(due.has(kept)).toBe(false)

    const result = await runApplicationPurge(payload)
    expect(result.failed).toBe(0)
    for (const gone of [declinedLongAgo, withdrawnLongAgo, staleDraft])
      expect(await exists(gone)).toBe(false)
    for (const kept of [declinedLately, freshDraft, approvedLongAgo, beingRead])
      expect(await exists(kept)).toBe(true)
  })

  it('keeps a curator on file for 12 months when they asked, 90 days otherwise', async () => {
    const declined = await curatorAt('not-this-time', 100)
    const onFile = await curatorAt('on-file', 100)
    const onFileYearAgo = await curatorAt('on-file', 370)
    const talking = await curatorAt('talking', 400)

    await runApplicationPurge(payload)
    expect(await exists(declined)).toBe(false)
    expect(await exists(onFile)).toBe(true)
    expect(await exists(onFileYearAgo)).toBe(false)
    expect(await exists(talking)).toBe(true)
  })
})
