import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { PartnerOnboarding } from '@/components/onboarding/PartnerOnboarding'
import { PARTNER_CATEGORIES } from '@/members/categories'
import { createFormToken } from '@/members/formToken'
import { applicationsOpenness } from '@/members/openness'
import { ApplicationsClosed } from '@/components/onboarding/ApplicationsClosed'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Work with us as a partner',
  description: 'For curators, interior designers, decorators, designers, engineers and partners.',
}

type Args = { searchParams: Promise<{ category?: string }> }

export default async function PartnerApplicationPage({ searchParams }: Args) {
  await headers()
  const { open, note } = await applicationsOpenness(await getPayload({ config: configPromise }))
  const { category } = await searchParams
  const initial = PARTNER_CATEGORIES.some((c) => c.value === category) ? category : undefined
  return (
    <OnboardingPage
      heading="Work with us"
      intro="For curators, interior designers and decorators; for designers and engineers; and for galleries, institutions and businesses who think in the long term. Tell us who you are and what you have in mind. It takes a few minutes."
      label="Partners"
    >
      {open ? (
        <PartnerOnboarding formToken={createFormToken()} initialCategory={initial} />
      ) : (
        <ApplicationsClosed note={note} />
      )}
    </OnboardingPage>
  )
}
