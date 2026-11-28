import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { VerifyIdentity, type VerifyStart } from '@/components/account/VerifyIdentity'
import { INDIA } from '@/forms/country/rules'
import { identityChecked, identitySent } from '@/kyc/check'
import { maskedKyc, savedIdentityValues } from '@/kyc/service'
import { findOwnApplication } from '@/members/application'
import { MEMBER_COOKIE } from '@/security/constants'
import { readSession } from '@/security/memberSession'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Confirm who you are',
  robots: { index: false, follow: false },
}

const Frame: React.FC<{ reference?: string; children: React.ReactNode }> = ({
  reference,
  children,
}) => (
  <div className="house apply">
    <div className="house-wrap">
      <section className="house-hero">
        <div className="house-lab">
          <p className="house-small">Your account</p>
        </div>
        <div className="house-con max-w-[780px]">
          {reference && (
            <p className="house-small tracking-wider">Application {reference} · Approved</p>
          )}
          <h1 className="apply-h1">Confirm who you are</h1>
          <p className="house-lead">
            We would like to work with you. Before we send our agreement, we need to be sure who
            you are. It takes about five minutes.
          </p>
        </div>
      </section>
      {children}
    </div>
  </div>
)

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="house-sec border-t border-[#e3cfa3]">
    <div className="house-lab" />
    <div className="house-con max-w-[780px]">
      {children}
      <p className="mt-6">
        <a className="link link-caps" href="/account">
          Go to your account
        </a>
      </p>
    </div>
  </section>
)

/**
 * /account/verify, and /account/verify?for=partner for a trade partner: "Confirm who you are",
 * after approval (the founder's Verify design). Before approval, or once the details are sent,
 * the page says where things stand instead.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>
}) {
  const payload = await getPayload({ config: configPromise })
  const active = await readSession(payload, (await cookies()).get(MEMBER_COOKIE)?.value)
  if (!active) redirect('/collaborate/signin')
  const { member } = active
  const kind = (await searchParams).for === 'partner' ? 'partner' : 'artist'

  const application = await findOwnApplication(payload, member, kind, 0)
  if (!application || application.stage !== 'approved') {
    return (
      <Frame>
        <Note>
          <p className="measure">
            This page is for applicants we have approved. Your account has nothing to confirm yet.
          </p>
        </Note>
      </Frame>
    )
  }

  const record = (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  const signed = Boolean(kind === 'artist' ? member.artistId : member.partnerId)
  if (signed || identityChecked(record)) {
    return (
      <Frame reference={application.reference}>
        <Note>
          <p className="measure">
            {signed
              ? 'You have signed your agreement. Thank you.'
              : 'We have checked your details. Your agreement is ready to read and sign in your account.'}
          </p>
        </Note>
      </Frame>
    )
  }
  if (identitySent(record)) {
    return (
      <Frame reference={application.reference}>
        <Note>
          <p className="measure">
            We are checking your details. We will email you once we have, and your agreement will
            then be ready to sign in your account.
          </p>
        </Note>
      </Frame>
    )
  }

  // The page follows the country in the application, unless a draft chose otherwise
  const country =
    kind === 'artist' ? application.address?.residence?.country : application.partner?.country
  const masked = await maskedKyc(payload, member.id)
  const names = await savedIdentityValues(payload, member.id)
  const applied =
    (kind === 'artist' ? application.about?.legalName : application.partner?.fullName) ?? ''
  const start: VerifyStart = {
    kind,
    reference: application.reference,
    primary:
      masked?.idType === 'passport' || masked?.idType === 'pan'
        ? masked.idType
        : (country || INDIA) === INDIA
          ? 'pan'
          : 'passport',
    panName: names.panName ?? applied,
    passportName: names.passportName ?? applied,
    dateOfBirth: kind === 'artist' ? (application.about?.dateOfBirth ?? null) : null,
    saved: {
      panMasked: masked?.panMasked ?? null,
      passportMasked: masked?.passportMasked ?? null,
      aadhaarLast4: Boolean(masked?.saved.aadhaarLast4),
      passportCountry: masked?.passportCountry ?? null,
      passportExpiry: masked?.passportExpiry ?? null,
      idChoice: (masked?.idChoice as 'aadhaar' | 'other' | null) ?? null,
      otherIdKind: masked?.otherIdKind ?? null,
      addressOnIdMatches: masked?.addressOnIdMatches ?? null,
      documents: masked?.documents ?? [],
    },
  }

  return (
    <Frame reference={application.reference}>
      <VerifyIdentity start={start} />
    </Frame>
  )
}
