// @vitest-environment node
import { sql } from '@payloadcms/db-postgres'
import { PDFDocument } from 'pdf-lib'
import { getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { GET as readAgreement } from '@/app/(frontend)/next/members/agreement/route'
import { ARTIST_AGREEMENT, TRADE_AGREEMENT } from '@/agreements/documents'
import {
  AgreementError,
  issueAgreementCode,
  receiveAgreementPhoto,
  signAgreement,
} from '@/agreements/service'
import { uploadCountersigned } from '@/agreements/staff'
import { openKycDocument, saveKyc } from '@/kyc/service'
import { ensureApplication } from '@/members/accounts'
import type { AgreementExecution, Member, User } from '@/payload-types'
import { MEMBER_COOKIE } from '@/security/constants'
import { createSession } from '@/security/memberSession'
import { execute } from '@/utilities/sql'

import { FAKE, goodKyc, identityPhotoBytes, removeKycFor } from '../helpers/kyc'

/*
 * Signing an agreement after approval: only with the member's own ID, only with a live photo taken
 * with the current code, only with both boxes and I AGREE; the PDF kept encrypted with the signer's
 * block filled in; and, once staff upload the countersigned copy, the record locked.
 */

const DOMAIN = '@agreements.example.test'
const randomKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
let payload: Payload
let reviewer: User

const signing = { ip: '198.51.100.7', userAgent: 'test' }

const approvedArtist = async () => {
  const { member, application } = await ensureApplication(payload, {
    email: `artist-${crypto.randomUUID().slice(0, 8)}${DOMAIN}`,
    type: 'artist',
  })
  await payload.update({
    collection: 'applications',
    id: application.id,
    data: {
      about: { legalName: 'Asha Example', phone: '+91 98765 43210' },
      address: { residence: { line1: '7 Example Lane', city: 'Kathua', postalCode: '184101' } },
    } as never,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })
  await saveKyc(payload, {
    member,
    input: goodKyc() as never,
    reference: application.reference,
    consent: { noticeVersion: 'test', confirmation: 'I AGREE' },
  })
  const artistId = `AT-${crypto
    .randomUUID()
    .replace(/[^A-F0-9]/gi, '')
    .slice(0, 5)
    .toUpperCase()}`
  await execute(payload, sql`UPDATE members SET artist_id = ${artistId} WHERE id = ${member.id}`)
  const fresh = (await payload.findByID({
    collection: 'members',
    id: member.id,
    overrideAccess: true,
  })) as Member
  return fresh
}

beforeAll(async () => {
  process.env.KYC_ENCRYPTION_KEY ||= randomKey()
  process.env.KYC_BLIND_INDEX_KEY ||= randomKey()
  payload = await getPayload({ config: await config })
  await removeKycFor(payload, `%${DOMAIN}`)
  reviewer =
    (
      await payload.find({
        collection: 'users',
        where: { email: { equals: 'agreements-reviewer-test@pjk.co.in' } },
        overrideAccess: true,
      })
    ).docs[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email: 'agreements-reviewer-test@pjk.co.in',
        name: 'Agreements test',
        roles: ['kyc-reviewer'] as never,
        status: 'active',
        password: 'Rw8-quiet-Forest-2026!',
      } as never,
      overrideAccess: true,
    }))
})

afterAll(async () => {
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
  await execute(payload, sql`DELETE FROM rate_limits WHERE key LIKE 'agreement%'`)
})

describe('signing the artist agreement', () => {
  it('is refused with an ID that is not the member’s own, or for the other agreement', async () => {
    const member = await approvedArtist()
    const { value } = await createSession(payload, { memberId: member.id })
    const ask = (kind: string, id: string) =>
      readAgreement(
        new Request(`http://localhost:3000/next/members/agreement?kind=${kind}&id=${id}`, {
          headers: { cookie: `${MEMBER_COOKIE}=${encodeURIComponent(value)}` },
        }),
      )
    expect((await ask('artist', 'AT-ZZZZZ')).status).toBe(403)
    expect((await ask('partner', member.artistId!)).status).toBe(403)
    const ok = await ask('artist', member.artistId!.toLowerCase())
    expect(ok.status).toBe(200)
    const body = await ok.json()
    expect(body.state).toBe('not-started')
    expect(body.signer).toMatchObject({
      name: FAKE.panName,
      memberCode: member.artistId,
      phone: '+91 98765 43210',
      address: '7 Example Lane, Kathua, 184101',
    })
    // The page shows the PAN's mask, never the PAN
    expect(JSON.stringify(body)).not.toContain(FAKE.pan)
  })

  it('needs the photo taken with the current code, both boxes, and I AGREE exactly', async () => {
    const member = await approvedArtist()
    const sign = (extra: Partial<Parameters<typeof signAgreement>[3]> = {}) =>
      signAgreement(payload, member, ARTIST_AGREEMENT, {
        typed: 'I AGREE',
        agreedTerms: true,
        agreedPrivacy: true,
        ...signing,
        ...extra,
      })
    await expect(sign()).rejects.toThrow(AgreementError)

    const first = await issueAgreementCode(payload, member, ARTIST_AGREEMENT)
    const second = await issueAgreementCode(payload, member, ARTIST_AGREEMENT)
    const bytes = await identityPhotoBytes()
    // A new code ends the old one
    await expect(
      receiveAgreementPhoto(payload, member, ARTIST_AGREEMENT, {
        bytes,
        code: first.code,
        capturedWith: 'camera',
      }),
    ).rejects.toThrow(/earlier code/)
    // So does running out
    await expect(
      receiveAgreementPhoto(
        payload,
        member,
        ARTIST_AGREEMENT,
        { bytes, code: second.code, capturedWith: 'camera' },
        new Date(Date.now() + 13 * 60_000),
      ),
    ).rejects.toThrow(/ran out/)
    await receiveAgreementPhoto(payload, member, ARTIST_AGREEMENT, {
      bytes,
      code: second.code,
      capturedWith: 'camera',
    })

    await expect(sign({ agreedPrivacy: false })).rejects.toThrow(/both boxes/)
    await expect(sign({ typed: 'i agree' })).rejects.toThrow(/I AGREE/)
    const signed = await sign()
    expect(signed.signedAtIst).toMatch(/IST$/)
    // Once signed, it cannot be signed again or given a new code
    await expect(sign()).rejects.toThrow(/already signed/)
    await expect(issueAgreementCode(payload, member, ARTIST_AGREEMENT)).rejects.toThrow(
      /already signed/,
    )

    const execution = (
      await payload.find({
        collection: 'agreement-executions',
        where: { member: { equals: member.id } },
        overrideAccess: true,
        depth: 0,
      })
    ).docs[0] as AgreementExecution
    expect(execution).toMatchObject({
      state: 'pending-countersignature',
      memberCode: member.artistId,
      version: ARTIST_AGREEMENT.version,
      verificationCode: second.code,
      typed: 'I AGREE',
      ip: signing.ip,
    })
    expect(execution.signedPdfSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(execution.photoSha256).toMatch(/^[0-9a-f]{64}$/)

    // The signed PDF is in the vault, and opens as the agreement with this version
    const pdf = await openKycDocument(payload, {
      documentId: execution.signedPdf as number,
      actor: reviewer,
      reason: 'Checking the signed agreement in a test',
    })
    const loaded = await PDFDocument.load(pdf.bytes)
    expect(loaded.getSubject()).toBe(ARTIST_AGREEMENT.version)

    // Staff upload the countersigned copy: the record is executed and locked
    const countersign = () => {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(pdf.bytes)], { type: 'application/pdf' }))
      return uploadCountersigned({
        payload,
        user: reviewer,
        routeParams: { id: execution.id },
        formData: async () => form,
      } as unknown as PayloadRequest)
    }
    const response = await countersign()
    expect(response.status).toBe(200)
    const executed = (await payload.findByID({
      collection: 'agreement-executions',
      id: execution.id,
      overrideAccess: true,
      depth: 0,
    })) as AgreementExecution
    expect(executed.state).toBe('executed')
    expect(executed.countersignedPdfSha256).toMatch(/^[0-9a-f]{64}$/)
    expect((await countersign()).status).toBe(409)
  })

  it('asks a trade partner for their firm’s details', async () => {
    const member = await approvedArtist()
    await execute(payload, sql`UPDATE members SET partner_id = 'PT-TEST9' WHERE id = ${member.id}`)
    const partner = { ...member, partnerId: 'PT-TEST9' } as Member
    const { code } = await issueAgreementCode(payload, partner, TRADE_AGREEMENT)
    await receiveAgreementPhoto(payload, partner, TRADE_AGREEMENT, {
      bytes: await identityPhotoBytes(),
      code,
      capturedWith: 'upload',
    })
    const base = { typed: 'I AGREE', agreedTerms: true, agreedPrivacy: true, ...signing }
    await expect(signAgreement(payload, partner, TRADE_AGREEMENT, base)).rejects.toThrow(
      /firm or studio/,
    )
    await signAgreement(payload, partner, TRADE_AGREEMENT, {
      ...base,
      firm: 'Example Studio LLP',
      firmRegistration: '01ABCDE1234F1Z5',
      address: '12 Example Road, Jammu 180001',
    })
  })
})
