// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as reapply } from '@/app/(frontend)/next/members/application/reapply/route'
import { POST as saveStep } from '@/app/(frontend)/next/members/application/step/route'
import { POST as withdraw } from '@/app/(frontend)/next/members/application/withdraw/route'
import { POST as saveKycStep } from '@/app/(frontend)/next/members/kyc/route'
import { DeclinedNotice } from '@/components/onboarding/DeclinedNotice'
import { kycPurgeCandidates, storeKycDocument } from '@/kyc/service'
import { ensureApplication } from '@/members/accounts'
import { decideApplication } from '@/members/decide'
import { applyAgain, canReapply } from '@/members/reapply'
import { TRANSITIONS, type Stage } from '@/members/stages'
import { fillEmpty } from '@/migrations/20261014_105526_declined_applications'
import type { Application, Member, User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { openApplicationsForTests } from '../helpers/applicationsOpen'
import { goodKyc, identityPhotos, removeKycFor } from '../helpers/kyc'

/*
 * Every stage an application can be in, what moves it, and what it can never become; withdrawing;
 * applying again as a new application; and an application declined before any of this existed.
 * Everyone here is made up (@stages.example.test) and everything created is removed.
 */

let payload: Payload
let closeApplications: () => Promise<void>
let staff: User
const DOMAIN = '@stages.example.test'
const ORIGIN = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const DAY = 86_400_000
let ip = 10
const unique = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`

const STAGES = Object.keys(TRANSITIONS) as Stage[]
const idOf = (ref: unknown) => (ref && typeof ref === 'object' ? (ref as { id: number }).id : ref)

const applicant = async (type: 'artist' | 'partner' = 'artist') => {
  const { member, application } = await ensureApplication(payload, { email: unique(type), type })
  const { value } = await createSession(payload, { memberId: member.id })
  return { member, application, cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` }
}

const call = (handler: (r: Request) => Promise<Response>, cookie: string, body: unknown = {}) =>
  handler(
    new Request(`${ORIGIN}/next/members/x`, {
      method: 'POST',
      headers: {
        cookie,
        origin: ORIGIN,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${ip++}`,
      },
      body: JSON.stringify(body),
    }),
  )

/** A made-up passport page and the identity photos, as the Identity step needs them */
const identityDocuments = async (member: Member) => {
  const passport = await storeKycDocument(payload, {
    member,
    kind: 'other-id',
    bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
  })
  const photos = await identityPhotos(payload, member, { dateOfBirth: aboutYou.dateOfBirth })
  return { 'other-id': passport.id, ...photos }
}

/** Puts an application at a stage directly, as the database would hold it */
const putAt = (id: number, stage: Stage, extra: Record<string, unknown> = {}) =>
  execute(
    payload,
    sql`UPDATE applications SET stage = ${stage}::enum_applications_stage, decided_at = ${
      (extra.decidedAt as string) ?? null
    }, reapply_from = ${(extra.reapplyFrom as string) ?? null} WHERE id = ${id}`,
  )

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await removeKycFor(payload, like)
  await execute(
    payload,
    sql`DELETE FROM member_sessions WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(
    payload,
    sql`DELETE FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'application-%'`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  closeApplications = await openApplicationsForTests(payload)
  const email = 'stages-test@pjk.co.in'
  staff =
    (
      await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        overrideAccess: true,
      })
    ).docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email,
        name: 'Stages test',
        roles: ['editor'] as never,
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      },
      overrideAccess: true,
    }))
})

afterAll(async () => {
  await cleanup()
  await closeApplications()
  await payload.delete({
    collection: 'users',
    where: { email: { equals: 'stages-test@pjk.co.in' } },
    overrideAccess: true,
  })
})

describe('the stages of an application', () => {
  it('moves only where it should, whoever asks', async () => {
    const { application } = await applicant()
    for (const from of STAGES) {
      for (const to of STAGES) {
        if (from === to) continue
        await putAt(application.id, from)
        const attempt = payload
          .update({
            collection: 'applications',
            id: application.id,
            data: { stage: to },
            overrideAccess: true,
            context: { disableRevalidate: true },
          })
          .then(
            () => true,
            () => false,
          )
        expect(await attempt, `${from} → ${to}`).toBe(TRANSITIONS[from].includes(to))
      }
    }
  })

  it('goes from sent to under review when staff start reading, without an email', async () => {
    const { application } = await applicant()
    await expect(
      decideApplication(payload, {
        applicationId: application.id,
        decision: 'review',
        actor: staff,
      }),
    ).rejects.toThrow(/cannot be given that decision/)
    await putAt(application.id, 'submitted')
    const { application: reading } = await decideApplication(payload, {
      applicationId: application.id,
      decision: 'review',
      actor: staff,
    })
    expect(reading.stage).toBe('under-review')
    expect(reading.decidedAt ?? null).toBeNull()
    // From under review, every decision is still open
    await decideApplication(payload, {
      applicationId: application.id,
      decision: 'request-changes',
      note: 'One more work, please.',
      actor: staff,
    })
  })
})

describe('withdrawing', () => {
  it('is open until a decision, and then never', async () => {
    for (const stage of STAGES) {
      const { application, cookie } = await applicant()
      await putAt(application.id, stage)
      const response = await call(withdraw, cookie, { type: 'artist' })
      const allowed = TRANSITIONS[stage].includes('withdrawn')
      expect(response.status, stage).toBe(allowed ? 200 : 409)
      const after = await payload.findByID({
        collection: 'applications',
        id: application.id,
        overrideAccess: true,
      })
      expect(after.stage).toBe(allowed ? 'withdrawn' : stage)
      if (allowed) expect(after.withdrawnAt).toBeTruthy()
    }
  })

  it('deletes an artist’s identity details at once, and lets them start again whenever they like', async () => {
    const { member, cookie } = await applicant()
    expect((await call(saveStep, cookie, { step: 'about', data: aboutYou })).status).toBe(200)
    const photos = await identityDocuments(member)
    expect((await call(saveKycStep, cookie, goodKyc(photos))).status).toBe(200)

    expect((await call(withdraw, cookie, { type: 'artist' })).status).toBe(200)
    const records = await payload.count({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
    expect(records.totalDocs).toBe(0)

    const again = await call(reapply, cookie, { type: 'artist' })
    expect(again.status).toBe(200)
    const fresh = (
      await payload.find({
        collection: 'applications',
        where: { member: { equals: member.id } },
        sort: '-createdAt',
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]!
    expect(fresh.stage).toBe('draft')
    expect(fresh.about?.legalName).toBe(aboutYou.legalName)
  })
})

const aboutYou = {
  legalName: 'Asha Example',
  displayName: 'Asha',
  dateOfBirth: '1990-04-12',
  phone: '98765 43210',
  language: 'English',
}

describe('applying again', () => {
  it('keeps each application as its own record, one current at a time, with the history linked', async () => {
    const { member, application, cookie } = await applicant()
    expect((await call(saveStep, cookie, { step: 'about', data: aboutYou })).status).toBe(200)
    await putAt(application.id, 'rejected', {
      decidedAt: new Date(Date.now() - 91 * DAY).toISOString(),
      reapplyFrom: new Date(Date.now() - DAY).toISOString(),
    })
    const second = await applyAgain(payload, member, 'artist')
    expect(second.reference).not.toBe(application.reference)
    expect(idOf(second.previousApplication)).toBe(application.id)

    // Only one current application of a kind: a second one cannot be made beside it
    await expect(applyAgain(payload, member as Member, 'artist')).rejects.toThrow(/still open/)
    const all = await payload.find({
      collection: 'applications',
      where: { member: { equals: member.id } },
      overrideAccess: true,
      showHiddenFields: true,
    })
    const slots = all.docs.map((a) => (a as Application & { currentSlot?: string }).currentSlot)
    expect(slots.filter(Boolean)).toEqual([`${member.id}:artist`])
  })

  it('keeps an artist’s identity answers but asks for documents and photo again', async () => {
    const { member, application, cookie } = await applicant()
    expect((await call(saveStep, cookie, { step: 'about', data: aboutYou })).status).toBe(200)
    const photos = await identityDocuments(member)
    expect((await call(saveKycStep, cookie, goodKyc(photos))).status).toBe(200)
    await putAt(application.id, 'rejected', {
      decidedAt: new Date(Date.now() - 10 * DAY).toISOString(),
      reapplyFrom: new Date(Date.now() - DAY).toISOString(),
    })
    await applyAgain(payload, member, 'artist')

    const documents = await payload.count({
      collection: 'kyc-documents',
      where: { member: { equals: member.id } },
      overrideAccess: true,
    })
    expect(documents.totalDocs).toBe(0)
    const record = (
      await payload.find({
        collection: 'kyc-records',
        where: { member: { equals: member.id } },
        overrideAccess: true,
        depth: 0,
      })
    ).docs[0]!
    expect(record.documents ?? []).toEqual([])
    expect(record.idType).toBeTruthy()
  })

  it('keeps the identity details of someone who started again from the weekly purge', async () => {
    const { member, application, cookie } = await applicant()
    expect((await call(saveStep, cookie, { step: 'about', data: aboutYou })).status).toBe(200)
    const photos = await identityDocuments(member)
    expect((await call(saveKycStep, cookie, goodKyc(photos))).status).toBe(200)
    await putAt(application.id, 'rejected', {
      decidedAt: new Date(Date.now() - 120 * DAY).toISOString(),
      reapplyFrom: new Date(Date.now() - 30 * DAY).toISOString(),
    })
    const due = async () =>
      (await kycPurgeCandidates(payload)).members.some((m) => m.memberId === member.id)
    expect(await due()).toBe(true)
    await applyAgain(payload, member, 'artist')
    // The old decline no longer counts: their current application is a fresh draft
    expect(await due()).toBe(false)
  })
})

describe('an application declined before this change', () => {
  it('gets its date to apply again from the decision, and nothing already set changes', async () => {
    const { member, application } = await applicant()
    const { application: kept } = await applicant()
    const decided = new Date(Date.now() - 100 * DAY)
    const setEarlier = new Date(Date.now() + 40 * DAY).toISOString()
    // As the old code left them: no date to apply again on one, and no current-application mark
    await execute(
      payload,
      sql`UPDATE applications SET stage = 'rejected', decided_at = ${decided.toISOString()},
          decision_note = NULL, reapply_from = NULL, current_slot = NULL WHERE id = ${application.id}`,
    )
    await execute(
      payload,
      sql`UPDATE applications SET stage = 'rejected', decided_at = ${decided.toISOString()},
          reapply_from = ${setEarlier} WHERE id = ${kept.id}`,
    )

    await fillEmpty((payload.db as unknown as { drizzle: never }).drizzle)
    await fillEmpty((payload.db as unknown as { drizzle: never }).drizzle) // twice: nothing more happens

    const filled = (await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
      showHiddenFields: true,
    })) as Application & { currentSlot?: string }
    expect(new Date(filled.reapplyFrom!).getTime()).toBe(decided.getTime() + 90 * DAY)
    expect(filled.currentSlot).toBe(`${member.id}:artist`)
    const untouched = await payload.findByID({
      collection: 'applications',
      id: kept.id,
      overrideAccess: true,
    })
    expect(untouched.reapplyFrom).toBe(setEarlier)

    // It shows the new screen sensibly: no note, a date already passed, so they may apply again
    expect(canReapply(filled)).toBe(true)
    const html = renderToStaticMarkup(
      React.createElement(DeclinedNotice, {
        kind: 'artist',
        reference: filled.reference,
        note: filled.decisionNote,
        reapplyFrom: filled.reapplyFrom,
        ready: canReapply(filled),
        socials: [],
      }),
    )
    expect(html).toContain('We are not able to accept your application this time.')
    expect(html).toContain('href="mailto:hello@pjk.co.in"')
    expect(html).toContain('You are welcome to apply again.')
    expect(html).not.toContain('A note from us')
    expect(html).not.toContain('Follow Phulhaar')
    const again = await applyAgain(payload, member, 'artist')
    expect(idOf(again.previousApplication)).toBe(application.id)
  })
})

describe('the declined screen', () => {
  it('shows the note, where to write, when to apply again, and Phulhaar’s accounts once set', () => {
    const reapplyFrom = new Date(Date.UTC(2027, 1, 11, 6)).toISOString()
    const html = renderToStaticMarkup(
      React.createElement(DeclinedNotice, {
        kind: 'artist',
        reference: 'A-TEST01',
        note: 'We would like to see more recent work.',
        reapplyFrom,
        ready: false,
        socials: [
          { platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/example' },
        ],
      }),
    )
    expect(html).toContain('A note from us')
    expect(html).toContain('We would like to see more recent work.')
    expect(html).toContain('For any further questions, contact us at')
    expect(html).toContain('11 February 2027')
    expect(html).toContain('Follow Phulhaar')
    expect(html).toContain('href="https://instagram.com/example"')
    expect(html).not.toContain('Facebook')
  })
})
