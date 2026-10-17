// @vitest-environment node
import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveKyc, storeKycDocument } from '@/kyc/service'
import { ensureApplication, findMember } from '@/members/accounts'
import { formatMemberId, MEMBER_ID_SEQUENCE } from '@/members/ids'
import { ingestPortfolioImage } from '@/members/portfolio'
import type { Member, User } from '@/payload-types'
import { eraseMember, eraseStaff, recordDeletionRequest } from '@/people/erase'
import { createSession, readSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { appRolePayload, appRoleUrl } from '../helpers/appRole'
import { goodKyc } from '../helpers/kyc'

/*
 * Deleting people (src/people/erase.ts), as the live site's own database role does it
 * (tests/helpers/appRole.ts): not as the database's owner, which no permission or policy ever
 * stops. Everyone here is made up (@deletion.example.test, staff named "Deletion test", and
 * names and numbers that are random per run) and everything is removed afterwards.
 */

let owner: Payload
let app: Payload
let admin: User
const DOMAIN = '@deletion.example.test'
const tag = () => randomBytes(4).toString('hex')
const password = () => `${randomBytes(18).toString('base64url')}-Aa1!`

const staffMember = (roles: string[], name = 'Deletion test') =>
  owner.create({
    collection: 'users',
    data: {
      name,
      email: `deletion-${tag()}@pjk.co.in`,
      password: password(),
      roles,
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as Promise<User>

const asStaff = (user: User) => ({ ...user, collection: 'users' }) as never

/** Approves an artist the way an approval does: the next number from the artists' sequence */
const approve = async (member: Member) => {
  const [row] = await execute<{ n: string }>(
    owner,
    sql`SELECT nextval(${MEMBER_ID_SEQUENCE.artist}) AS n`,
  )
  return (await owner.update({
    collection: 'members',
    id: member.id,
    data: { artistId: formatMemberId('artist', Number(row.n)) },
    overrideAccess: true,
    context: { issuingMemberId: 'artistId', disableRevalidate: true },
  })) as Member
}

const picture = () =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .toBuffer()

/** Every text column of every table that holds `needle`, as "table.column" */
const foundAnywhere = async (needle: string) => {
  const columns = await execute<{ t: string; c: string }>(
    owner,
    sql`SELECT table_name AS t, column_name AS c FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type IN ('character varying', 'text', 'jsonb', 'json')`,
  )
  const hits: string[] = []
  for (const { t, c } of columns) {
    const [row] = await execute<{ n: number }>(
      owner,
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)} WHERE ${sql.identifier(c)}::text ILIKE ${`%${needle}%`}`,
    )
    if (row.n) hits.push(`${t}.${c}`)
  }
  return hits
}

/** A full artist: answers, approval, profile, contact details, KYC, works, pictures and a session */
const fullArtist = async ({ hold = false } = {}) => {
  const t = tag()
  const person = {
    email: `artist-${t}${DOMAIN}`,
    name: `Asha Deletiontest${t}`,
    phone: `98${String(parseInt(t, 16)).padStart(8, '0').slice(0, 8)}`,
    street: `${t} Erasure Lane`,
  }
  const { member, application } = await ensureApplication(owner, {
    email: person.email,
    type: 'artist',
  })
  await owner.update({
    collection: 'applications',
    id: application.id,
    data: {
      about: { legalName: person.name, phone: person.phone },
      address: { residence: { line1: person.street, city: 'Kathua' } },
      practice: { bio: `${person.name} paints rivers.` },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const approved = await approve(member)
  const portrait = await ingestPortfolioImage(owner, approved, await picture())
  const shown = await ingestPortfolioImage(owner, approved, await picture())
  await owner.update({
    collection: 'members',
    id: member.id,
    data: {
      displayName: person.name,
      phone: person.phone,
      contactAddress: { line1: person.street },
      profile: { displayName: person.name, bio: `About ${person.name}`, portrait: portrait.id },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const kept = await owner.create({
    collection: 'artworks',
    data: {
      owner: member.id,
      title: `River ${t}`,
      description: 'A river at dusk, painted over three evenings, in oil on canvas.',
      images: [shown.id],
      review: { state: 'approved' },
      published: { title: `River ${t}`, images: [shown.id] },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const draft = await owner.create({
    collection: 'artworks',
    data: {
      owner: member.id,
      title: `Draft ${t}`,
      description: 'An unfinished study, never sent for review, in pencil on paper.',
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  const fresh = (await owner.findByID({
    collection: 'members',
    id: member.id,
    overrideAccess: true,
  })) as Member
  const document = await storeKycDocument(owner, {
    member: fresh,
    kind: 'other-id',
    bytes: Buffer.from('%PDF-1.7\n% a made-up passport page\n%%EOF\n'),
  })
  const record = await saveKyc(owner, {
    member: fresh,
    reference: application.reference,
    input: goodKyc({ 'other-id': document.id }) as never,
    consent: { noticeVersion: 'test', confirmation: 'I AGREE' },
  })
  if (hold) {
    await owner.update({
      collection: 'kyc-records',
      id: record.id,
      data: { legalHoldUntil: new Date(Date.now() + 400 * 86_400_000).toISOString() },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  }
  const session = await createSession(owner, { memberId: member.id })
  await owner.create({
    collection: 'security-events',
    data: {
      event: 'member-signed-in',
      email: person.email,
      ip: '198.51.100.7',
      subject: fresh.artistId,
    },
    overrideAccess: true,
  })
  return { person, member: fresh, application, kept, draft, portrait, shown, record, session }
}

const cleanup = async () => {
  const like = `%${DOMAIN}`
  const members = sql`SELECT id FROM members WHERE email LIKE ${like} OR (standing = 'erased' AND erasure_reason LIKE 'Deletion test%')`
  await execute(owner, sql`DELETE FROM kyc_documents WHERE member_id IN (${members})`)
  await execute(owner, sql`DELETE FROM kyc_records WHERE member_id IN (${members})`)
  await execute(owner, sql`DELETE FROM artworks WHERE owner_id IN (${members})`)
  await execute(owner, sql`DELETE FROM portfolio_images WHERE owner_id IN (${members})`)
  await execute(owner, sql`DELETE FROM member_sessions WHERE member_id IN (${members})`)
  await execute(owner, sql`DELETE FROM applications WHERE member_id IN (${members})`)
  await execute(owner, sql`DELETE FROM members WHERE id IN (${members})`)
  await execute(
    owner,
    sql`DELETE FROM security_events WHERE email LIKE ${like} OR detail LIKE '%Deletion test%' OR email LIKE 'Deleted %' OR subject LIKE 'Deleted %' OR event IN ('member-erased', 'staff-erased', 'security-log-erased')`,
  )
  await execute(
    owner,
    sql`DELETE FROM users WHERE name = 'Deletion test' OR (status = 'erased' AND erasure_reason LIKE 'Deletion test%')`,
  )
}

beforeAll(async () => {
  owner = await getPayload({ config: await config })
  if (appRoleUrl()) app = await appRolePayload()
  await cleanup()
  admin = await staffMember(['super-admin'])
})

afterAll(async () => {
  await cleanup()
})

describe.skipIf(!appRoleUrl())('deleting people, as the live site’s database role', () => {
  it('connects as a role that cannot bypass Row-Level Security', async () => {
    const [row] = await execute<{ bypass: boolean; superuser: boolean }>(
      app,
      sql`SELECT rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`,
    )
    expect(row).toEqual({ bypass: false, superuser: false })
  })

  it('removing a member’s row outright is refused by the database: their application needs it', async () => {
    // Why "Something went wrong" appeared when a member was deleted in the admin
    const { member } = await ensureApplication(owner, {
      email: `bare-${tag()}${DOMAIN}`,
      type: 'artist',
    })
    await expect(
      app.db.deleteOne({ collection: 'members', where: { id: { equals: member.id } } }),
    ).rejects.toMatchObject({
      cause: { code: '23502', table: 'applications', column: 'member_id' },
    })
  })

  it('the admin offers no outright delete for members or staff, so nothing breaks', async () => {
    const { member } = await ensureApplication(owner, {
      email: `partner-${tag()}${DOMAIN}`,
      type: 'partner',
    })
    await expect(
      app.delete({
        collection: 'members',
        id: member.id,
        overrideAccess: false,
        user: asStaff(admin),
      }),
    ).rejects.toMatchObject({ status: 403 })
    const editor = await staffMember(['editor'])
    await expect(
      app.delete({
        collection: 'users',
        id: editor.id,
        overrideAccess: false,
        user: asStaff(admin),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('erases an artist’s personal details everywhere and keeps the records that point at them', async () => {
    const a = await fullArtist()
    const result = await eraseMember(app, {
      memberId: a.member.id,
      actor: admin,
      confirm: a.member.artistId,
      reason: 'Deletion test: asked by email',
    })
    expect(result).toMatchObject({
      placeholder: `Deleted artist (${a.member.artistId})`,
      source: 'admin',
      kyc: 'purged',
      worksArchived: 1,
      worksRemoved: 1,
      picturesDeleted: 1,
    })

    const member = (await owner.findByID({
      collection: 'members',
      id: a.member.id,
      overrideAccess: true,
      showHiddenFields: true,
    })) as Member
    expect(member).toMatchObject({
      artistId: a.member.artistId,
      standing: 'erased',
      title: result.placeholder,
      displayName: result.placeholder,
      phone: null,
    })
    expect(member.email).toMatch(/@erased\.invalid$/)
    expect(member.profile?.bio ?? null).toBeNull()
    expect(member.erasure).toMatchObject({
      source: 'admin',
      reason: 'Deletion test: asked by email',
    })

    // The application keeps its reference and stage; every answer is gone
    const application = await owner.findByID({
      collection: 'applications',
      id: a.application.id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    expect(application.reference).toBe(a.application.reference)
    expect(application.member).toBe(a.member.id)
    expect(application.about?.legalName ?? null).toBeNull()

    // The approved work stays, archived, with its picture; the draft and the portrait are gone
    const kept = await owner.findByID({
      collection: 'artworks',
      id: a.kept.id,
      overrideAccess: true,
      depth: 0,
    })
    expect(kept.archived).toBe(true)
    expect(kept.owner).toBe(a.member.id)
    await expect(
      owner.findByID({ collection: 'artworks', id: a.draft.id, overrideAccess: true }),
    ).rejects.toBeTruthy()
    await expect(
      owner.findByID({ collection: 'portfolio-images', id: a.portrait.id, overrideAccess: true }),
    ).rejects.toBeTruthy()
    expect(
      (
        await owner.findByID({
          collection: 'portfolio-images',
          id: a.shown.id,
          overrideAccess: true,
        })
      ).id,
    ).toBe(a.shown.id)

    // KYC purged, documents included
    expect(
      (
        await owner.count({
          collection: 'kyc-records',
          where: { member: { equals: a.member.id } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(0)
    expect(
      (
        await owner.count({
          collection: 'kyc-documents',
          where: { member: { equals: a.member.id } },
          overrideAccess: true,
        })
      ).totalDocs,
    ).toBe(0)

    // Their name, address, phone and email are nowhere in the database
    for (const needle of [a.person.email, a.person.name, a.person.phone, a.person.street]) {
      expect(await foundAnywhere(needle), needle).toEqual([])
    }
  })

  it('keeps every security-log entry, under the placeholder, and records who deleted them and why', async () => {
    const a = await fullArtist()
    const before = await owner.count({
      collection: 'security-events',
      where: { email: { equals: a.person.email } },
      overrideAccess: true,
    })
    expect(before.totalDocs).toBeGreaterThan(0)
    const { placeholder } = await eraseMember(app, {
      memberId: a.member.id,
      actor: admin,
      confirm: a.member.artistId,
      reason: 'Deletion test: the log',
    })
    const renamed = await owner.find({
      collection: 'security-events',
      where: { email: { equals: placeholder } },
      overrideAccess: true,
      limit: 50,
    })
    expect(renamed.totalDocs).toBe(before.totalDocs)
    for (const entry of renamed.docs) expect(entry.ip ?? null).toBeNull()
    const erased = await owner.find({
      collection: 'security-events',
      where: {
        and: [{ event: { equals: 'member-erased' } }, { subject: { equals: a.member.artistId } }],
      },
      overrideAccess: true,
      depth: 0,
    })
    expect(erased.docs[0]).toMatchObject({ actor: admin.id })
    expect(erased.docs[0].detail).toContain('Deletion test: the log')
    const noted = await owner.count({
      collection: 'security-events',
      where: {
        and: [{ event: { equals: 'security-log-erased' } }, { subject: { equals: placeholder } }],
      },
      overrideAccess: true,
    })
    expect(noted.totalDocs).toBe(1)
  })

  it('never issues a deleted artist’s ID again', async () => {
    const a = await fullArtist()
    await eraseMember(app, {
      memberId: a.member.id,
      actor: admin,
      confirm: a.member.artistId,
      reason: 'Deletion test: IDs',
    })
    const { member } = await ensureApplication(owner, {
      email: `next-${tag()}${DOMAIN}`,
      type: 'artist',
    })
    const next = await approve(member)
    expect(next.artistId).not.toBe(a.member.artistId)
    expect(Number(next.artistId!.slice(2))).toBeGreaterThan(Number(a.member.artistId!.slice(2)))
    // The erased record still holds its ID, which is unique: nothing could take it
    const holder = await owner.find({
      collection: 'members',
      where: { artistId: { equals: a.member.artistId } },
      overrideAccess: true,
    })
    expect(holder.docs.map((m) => m.id)).toEqual([a.member.id])
  })

  it('keeps KYC under a legal hold, encrypted, and records why', async () => {
    const a = await fullArtist({ hold: true })
    const result = await eraseMember(app, {
      memberId: a.member.id,
      actor: admin,
      confirm: a.member.artistId,
      reason: 'Deletion test: hold',
    })
    expect(result.kyc).toBe('kept')
    expect(result.kept).toMatch(/hold until \d{4}-\d{2}-\d{2}/)
    const record = await owner.findByID({
      collection: 'kyc-records',
      id: a.record.id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    expect(record.member).toBe(a.member.id)
    expect(String((record as { panSealed?: string }).panSealed)).not.toContain('ABCPE1234F')
    const member = (await owner.findByID({
      collection: 'members',
      id: a.member.id,
      overrideAccess: true,
    })) as Member
    expect(member.erasure?.kept).toBe(result.kept)
  })

  it('a deleted member can no longer sign in, nor use a session they had', async () => {
    const a = await fullArtist()
    await eraseMember(app, {
      memberId: a.member.id,
      actor: admin,
      confirm: a.member.artistId,
      reason: 'Deletion test: sign-in',
    })
    expect(await findMember(app, a.person.email)).toBeNull()
    expect(await readSession(app, a.session.value)).toBeNull()
  })

  it('a member’s own deletion request ends in the same erasure', async () => {
    const a = await fullArtist()
    expect(await recordDeletionRequest(app, a.member)).toBe(true)
    const result = await eraseMember(app, {
      memberId: a.member.id,
      actor: admin,
      confirm: a.member.artistId,
      reason: 'Deletion test: their own request',
    })
    expect(result.source).toBe('data-request')
    const member = (await owner.findByID({
      collection: 'members',
      id: a.member.id,
      overrideAccess: true,
    })) as Member
    expect(member.erasure?.source).toBe('data-request')
  })

  it('asks for the ID typed out, a reason and a super admin, and never runs twice', async () => {
    const { member, application } = await ensureApplication(owner, {
      email: `applicant-${tag()}${DOMAIN}`,
      type: 'artist',
    })
    const editor = await staffMember(['editor'])
    const run = (over: Record<string, unknown>) =>
      eraseMember(app, {
        memberId: member.id,
        actor: admin,
        confirm: application.reference,
        reason: 'Deletion test: guards',
        ...over,
      } as never)
    await expect(run({ actor: editor })).rejects.toMatchObject({ status: 403 })
    await expect(run({ confirm: 'A-WRONG1' })).rejects.toThrow(/type .* exactly/)
    await expect(run({ reason: 'no' })).rejects.toThrow(/reason/)
    const result = await run({})
    expect(result.placeholder).toBe(`Deleted applicant (${application.reference})`)
    await expect(run({})).rejects.toMatchObject({ status: 409 })
    // Nor can anyone edit the record afterwards
    await expect(
      app.update({
        collection: 'members',
        id: member.id,
        data: { phone: '9800000000' },
        overrideAccess: false,
        user: asStaff(admin),
      }),
    ).rejects.toThrow(/deleted/)
  })

  it('the security log refuses to erase addresses for anyone not deleted', async () => {
    await expect(
      execute(
        app,
        sql`SELECT public.erase_from_security_log(ARRAY['someone@example.test'], 'Deleted artist (AT999999)')`,
      ),
    ).rejects.toBeTruthy()
    await expect(
      execute(app, sql`UPDATE security_events SET detail = 'changed'`),
    ).rejects.toBeTruthy()
  })

  it('erases a member of staff, who keeps a retired reference and can never sign in', async () => {
    const editor = await staffMember(['editor'])
    expect(editor.staffRef).toMatch(/^ST-\d{4,}$/)
    const event = await owner.create({
      collection: 'security-events',
      data: { event: 'staff-signed-in', email: editor.email, actor: editor.id, ip: '198.51.100.9' },
      overrideAccess: true,
    })
    const result = await eraseStaff(app, {
      userId: editor.id,
      actor: admin,
      confirm: editor.staffRef,
      reason: 'Deletion test: left the company',
    })
    expect(result.placeholder).toBe(`Deleted staff (${editor.staffRef})`)
    const erased = await owner.findByID({
      collection: 'users',
      id: editor.id,
      overrideAccess: true,
    })
    expect(erased).toMatchObject({
      name: result.placeholder,
      status: 'erased',
      staffRef: editor.staffRef,
    })
    expect(erased.email).toMatch(/@erased\.invalid$/)
    const entry = await owner.findByID({
      collection: 'security-events',
      id: event.id,
      overrideAccess: true,
      depth: 0,
    })
    expect(entry).toMatchObject({ email: result.placeholder, actor: editor.id, ip: null })
    expect(await foundAnywhere(editor.email)).toEqual([])
    await expect(
      owner.login({
        collection: 'users',
        data: { email: erased.email, password: 'anything-at-all-1A!' },
      }),
    ).rejects.toBeTruthy()
  })

  it('nobody deletes themselves, or the last super admin', async () => {
    await expect(
      eraseStaff(app, {
        userId: admin.id,
        actor: admin,
        confirm: admin.staffRef,
        reason: 'Deletion test: myself',
      }),
    ).rejects.toThrow(/your own/)
    // Every other super admin suspended for a moment, so `admin` is the last one standing
    const others = await execute<{ id: number }>(
      owner,
      sql`UPDATE users SET status = 'suspended' WHERE id <> ${admin.id} AND status = 'active'
          AND id IN (SELECT parent_id FROM users_roles WHERE value = 'super-admin') RETURNING id`,
    )
    try {
      const second = await staffMember(['super-admin'])
      await execute(owner, sql`UPDATE users SET status = 'suspended' WHERE id = ${admin.id}`)
      await expect(
        eraseStaff(app, {
          userId: second.id,
          actor: { ...admin, status: 'active' } as User,
          confirm: second.staffRef,
          reason: 'Deletion test: last one',
        }),
      ).rejects.toThrow(/last super admin/)
    } finally {
      await execute(owner, sql`UPDATE users SET status = 'active' WHERE id = ${admin.id}`)
      for (const { id } of others)
        await execute(owner, sql`UPDATE users SET status = 'active' WHERE id = ${id}`)
    }
  })
})
