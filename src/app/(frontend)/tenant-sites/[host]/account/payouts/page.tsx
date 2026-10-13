import type { Metadata } from 'next'
import React from 'react'

import { PayoutsView } from '@/components/portal/PayoutsView'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { maskedKyc } from '@/kyc/service'
import { StepUpProvider } from '@/components/onboarding/StepUp'
import { loadArtist } from '@/members/accountPage'
import { recentlyConfirmed } from '@/members/recent'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Payouts', robots: { index: false, follow: false } }

/** Where we pay the artist, masked, and the safe way to change it */
export default async function PayoutsPage() {
  const { payload, member, session } = await loadArtist()
  const masked = await maskedKyc(payload, member.id)
  // Payout details, even masked, only after a sign-in within the last 30 minutes
  const locked =
    Boolean(masked && (masked.bank || masked.pendingBank)) && !recentlyConfirmed(session)
  const kyc = masked && locked ? { ...masked, bank: null, pendingBank: null } : masked
  return (
    <PortalFrame
      current="/account/payouts"
      heading="Payouts"
      intro={<>Where we pay you. We only ever show part of each number.</>}
    >
      <StepUpProvider>
        <PayoutsView kyc={kyc as never} locked={locked} />
      </StepUpProvider>
    </PortalFrame>
  )
}
