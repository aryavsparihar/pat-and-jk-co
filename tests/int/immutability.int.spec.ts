// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureApplication } from '@/members/accounts'
import { ingestPortfolioImage } from '@/members/portfolio'
import type { Application, Member, PortfolioImage, User } from '@/payload-types'
import { execute } from '@/utilities/sql'

/*
 * The founder's immutability audit: once sent, signed or recorded, nothing of an application,
 * an identity record, a signed agreement, an ID, an address, a time or a picture can be changed,
 * by the member or by staff, through any edit. Only the server's own flows write them. Everyone
 * here is made up (@immutable.example.test) and removed afterwards.
 */

let payload: Payload
let staff: User
let member: Member
let application: Application
let picture: PortfolioImage
const DOMAIN = '@immutable.example.test'
const STAFF_EMAIL = `zz-immutable-${Math.random().toString(36).slice(2, 8)}@pjk.co.in`

const asStaff = () => ({
  user: { ...staff, collection: 'users' } as never,
  overrideAccess: false,
  context: { disableRevalidate: true },
})
const asTheMember = () => ({
  user: { ...member, collection: 'members' } as never,
  overrideAccess: false,
  context: { disableRevalidate: true },
})

const cleanup = async () => {
  const like = `%${DOMAIN}`
  await execute(
    payload,
    sql`DELETE FROM applications WHERE member_id IN (SELECT id FROM members WHERE email LIKE ${like})`,
  )
  const pictures = await payload.find({
    collection: 'portfolio-images',
    where: { 'owner.email': { like: DOMAIN } },
    overrideAccess: true,
    depth: 0,
  })
  for (const p of pictures.docs)
    await payload.delete({
      collection: 'portfolio-images',
      id: p.id,
      overrideAccess: true,
      context: { erasing: true },
    })
  await execute(payload, sql`DELETE FROM security_events WHERE email LIKE ${like}`)
  await execute(payload, sql`DELETE FROM members WHERE email LIKE ${like}`)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await cleanup()
  staff = (await payload.create({
    collection: 'users',
    data: {
      email: STAFF_EMAIL,
      password: 'Quiet-Forest-Lamp-29!',
      name: 'Immutability Test',
      roles: ['super-admin'],
      status: 'active',
    } as never,
    overrideAccess: true,
  })) as User
  const made = await ensureApplication(payload, {
    email: `artist-${Math.random().toString(36).slice(2, 10)}${DOMAIN}`,
    type: 'artist',
  })
  member = made.member
  const jpeg = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer()
  picture = await ingestPortfolioImage(payload, member, jpeg)
  // As sent: the server moves it on, with its answers and picture
  application = await payload.update({
    collection: 'applications',
    id: made.application.id,
    data: {
      about: { legalName: 'Asha Example', displayName: 'Asha' },
      portfolio: [{ image: picture.id, title: 'Sent work', year: 2024 }],
      stage: 'submitted',
      submittedAt: new Date().toISOString(),
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
})

afterAll(async () => {
  await cleanup()
  await payload.delete({ collection: 'users', where: { email: { equals: STAFF_EMAIL } } })
})

describe('what was sent stays as it was sent', () => {
  it('an application’s answers, reference and times cannot be edited by staff', async () => {
    await payload.update({
      collection: 'applications',
      id: application.id,
      data: {
        reference: 'A-FORGED',
        about: { legalName: 'Someone Else', displayName: 'Forged' },
        portfolio: [],
        submittedAt: '2020-01-01T00:00:00.000Z',
        consentRecord: [{ ip: '0.0.0.0', typed: 'forged' }],
      } as never,
      ...asStaff(),
    })
    const stored = await payload.findByID({
      collection: 'applications',
      id: application.id,
      overrideAccess: true,
      depth: 0,
    })
    expect(stored.reference).toBe(application.reference)
    expect(stored.about?.legalName).toBe('Asha Example')
    expect(stored.portfolio).toHaveLength(1)
    expect(stored.submittedAt).toBe(application.submittedAt)
    expect(stored.consentRecord ?? []).toHaveLength(0)
  })

  it('nor by the applicant once it is sent', async () => {
    await expect(
      payload.update({
        collection: 'applications',
        id: application.id,
        data: { about: { legalName: 'Someone Else' } } as never,
        ...asTheMember(),
      }),
    ).rejects.toThrow()
  })

  it('a member’s ID, address and standing cannot be edited', async () => {
    await payload.update({
      collection: 'members',
      id: member.id,
      data: {
        artistId: 'AT-FORGED',
        email: `forged${DOMAIN}`,
        standing: 'erased',
        artistApprovedAt: '2020-01-01T00:00:00.000Z',
      } as never,
      ...asStaff(),
    })
    const stored = await payload.findByID({
      collection: 'members',
      id: member.id,
      overrideAccess: true,
    })
    expect(stored.artistId ?? null).toBeNull()
    expect(stored.email).toBe(member.email)
    expect(stored.standing).toBe('active')
    expect(stored.artistApprovedAt ?? null).toBeNull()
  })

  it('a sent picture cannot be replaced, given to someone else, or deleted', async () => {
    const other = await payload.update({
      collection: 'portfolio-images',
      id: picture.id,
      data: { owner: staff.id } as never,
      ...asStaff(),
    })
    expect(typeof other.owner === 'object' ? other.owner?.id : other.owner).toBe(member.id)

    const jpeg = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer()
    await expect(
      payload.update({
        collection: 'portfolio-images',
        id: picture.id,
        data: {},
        file: { data: jpeg, mimetype: 'image/jpeg', name: 'swap.jpg', size: jpeg.length },
        ...asStaff(),
      }),
    ).rejects.toThrow(/cannot be replaced/)

    await expect(
      payload.delete({ collection: 'portfolio-images', id: picture.id, ...asStaff() }),
    ).rejects.toThrow(/application that was sent/)
  })

  it.each(['kyc-records', 'kyc-documents', 'agreement-executions', 'security-events'] as const)(
    '%s cannot be edited or deleted by anyone',
    async (collection) => {
      await expect(
        payload.update({ collection, where: {}, data: {} as never, ...asStaff() }),
      ).rejects.toThrow()
      await expect(payload.delete({ collection, where: {}, ...asStaff() })).rejects.toThrow()
    },
  )
})
