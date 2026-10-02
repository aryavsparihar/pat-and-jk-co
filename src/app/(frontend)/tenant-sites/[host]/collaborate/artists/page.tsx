import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { ArtistOnboarding } from '@/components/onboarding/ArtistOnboarding'
import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { createFormToken } from '@/members/formToken'
import { applicationsOpenness } from '@/members/openness'
import { ApplicationsClosed } from '@/components/onboarding/ApplicationsClosed'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

// Rendered per request: the page carries a fresh form token and a per-request script nonce
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Apply as an artist',
  description: 'Apply to show and sell your work with Phulhaar Gallery by PJK.',
}

export default async function ArtistApplicationPage() {
  await headers()
  const { open, note } = await applicationsOpenness(await getPayload({ config: configPromise }))
  return (
    <OnboardingPage
      heading="Show your work with *Phulhaar*"
      intro="Phulhaar Gallery by PJK shows fine and contemporary art, chosen with care and placed with people who will live with it. Tell us about yourself and your work. It takes about twenty minutes, and you can stop and come back at any time."
      label="Apply as an artist"
    >
      {open ? (
        <ArtistOnboarding formToken={createFormToken()} />
      ) : (
        <ApplicationsClosed note={note} />
      )}
    </OnboardingPage>
  )
}
