import type { Metadata } from 'next'
import React from 'react'

import { PayoutsView } from '@/components/portal/PayoutsView'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { maskedKyc } from '@/kyc/service'
import { loadArtist } from '@/members/accountPage'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Payouts', robots: { index: false, follow: false } }

/** Where we pay the artist, masked, and the safe way to change it */
export default async function PayoutsPage() {
  const { payload, member } = await loadArtist()
  const kyc = await maskedKyc(payload, member.id)
  return (
    <PortalFrame
      current="/account/payouts"
      heading="Payouts"
      intro={<>Where we pay you. We only ever show part of each number.</>}
    >
      <PayoutsView kyc={kyc as never} />
    </PortalFrame>
  )
}
