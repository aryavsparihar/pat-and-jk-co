import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { PartnerOnboarding } from '@/components/onboarding/PartnerOnboarding'
import { PrivacyText } from '@/components/onboarding/PrivacyText'
import RichText from '@/components/RichText'
import { PARTNER_CATEGORIES } from '@/members/categories'
import { createFormToken } from '@/members/formToken'
import { applicationsOpenness } from '@/members/openness'
import { partnerAgreement } from '@/members/partnerAgreement'
import { getTenantContext } from '@/utilities/tenant'
import { ApplicationsClosed } from '@/components/onboarding/ApplicationsClosed'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Work with us as a partner',
  description: 'For curators, interior designers, decorators, designers, engineers and partners.',
}

type Args = {
  params: Promise<{ host: string }>
  searchParams: Promise<{ category?: string }>
}

export default async function PartnerApplicationPage({ params, searchParams }: Args) {
  await headers()
  const ctx = await getTenantContext((await params).host)
  if (!ctx) notFound()
  const payload = await getPayload({ config: configPromise })
  const { open, note } = await applicationsOpenness(payload)
  // Until it is published in Site settings, the form says so and cannot be sent
  const agreement = open ? await partnerAgreement(payload) : null
  const { category } = await searchParams
  const initial = PARTNER_CATEGORIES.some((c) => c.value === category) ? category : undefined
  return (
    <OnboardingPage
      heading="Work with us"
      intro="For curators, interior designers and decorators; for designers and engineers; and for galleries, institutions and businesses who think in the long term. Tell us who you are and what you have in mind. It takes about ten minutes; have your PAN card to hand, and a phone or camera for a photo of yourself."
      label="Partners"
    >
      {open ? (
        <PartnerOnboarding
          agreement={
            agreement && {
              title: agreement.title,
              version: agreement.version,
              body: <RichText data={agreement.text as never} />,
            }
          }
          formToken={createFormToken()}
          initialCategory={initial}
          privacy={<PrivacyText tenantId={ctx.tenant.id} />}
        />
      ) : (
        <ApplicationsClosed note={note} />
      )}
    </OnboardingPage>
  )
}
