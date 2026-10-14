import type { Metadata } from 'next'
import React from 'react'

import { DataRequests, EmailChange, SessionsList } from '@/components/portal/AccountSettings'
import { StepUpProvider } from '@/components/onboarding/StepUp'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { loadArtist } from '@/members/accountPage'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } }

/** Member ID, email address, signed-in devices, and requests about the artist's data */
export default async function SettingsPage() {
  const { member } = await loadArtist()
  return (
    <PortalFrame
      current="/account/settings"
      heading="Account"
      intro={<>Your member ID, email address and devices.</>}
    >
      {/* Changing the address and asking for one's data need a recent sign-in */}
      <StepUpProvider>
        <section>
          <h2 className="display-sm">Member ID</h2>
          <p className="mt-4 tracking-wider">
            {[member.artistId, member.partnerId].filter(Boolean).join(' · ')}
          </p>
        </section>
        <section className="mt-14 border-t border-border pt-8">
          <h2 className="display-sm mb-6">Email address</h2>
          <EmailChange current={member.email} />
        </section>
        <section className="mt-14 border-t border-border pt-8">
          <h2 className="display-sm mb-6">Signed in</h2>
          <SessionsList />
        </section>
        <section className="mt-14 border-t border-border pt-8">
          <h2 className="display-sm mb-6">Your data</h2>
          <DataRequests />
        </section>
      </StepUpProvider>
    </PortalFrame>
  )
}
