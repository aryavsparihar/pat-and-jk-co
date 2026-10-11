import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { ArtistOnboarding } from '@/components/onboarding/ArtistOnboarding'
import { PrivacyText } from '@/components/onboarding/PrivacyText'
import { PhulhaarClosed } from '@/components/phulhaar/PhulhaarClosed'
import { PhulhaarPage } from '@/components/phulhaar/PhulhaarPage'
import { phulhaarDisplayFor } from '@/brands/phulhaar'
import { createFormToken } from '@/members/formToken'
import { artistTerms } from '@/members/terms'
import { applicationsOpenness } from '@/members/openness'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { getTenantContext } from '@/utilities/tenant'

const ABOUT =
  'Phulhaar Gallery by PJK shows fine and contemporary art, chosen with care and placed with people who will live with it.'

// Rendered per request: the page carries a fresh form token and a per-request script nonce
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Apply as an artist',
  description: 'Apply to show and sell your work with Phulhaar Gallery by PJK.',
}

export default async function ArtistApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ host: string }>
  searchParams: Promise<{ display?: string }>
}) {
  await headers()
  const ctx = await getTenantContext((await params).host)
  if (!ctx) notFound()
  const display = phulhaarDisplayFor((await searchParams).display)
  const payload = await getPayload({ config: configPromise })
  const { open, note } = await applicationsOpenness(payload)
  const terms = open ? await artistTerms(payload) : null
  return (
    <PhulhaarPage
      display={display}
      heading="Show your work with *Phulhaar*"
      intro={
        open
          ? `${ABOUT} Tell us about yourself and your work. It takes about twenty minutes, and you can stop and come back at any time.`
          : ABOUT
      }
      label="Apply as an artist"
    >
      {open ? (
        <ArtistOnboarding
          formToken={createFormToken()}
          privacy={<PrivacyText tenantId={ctx.tenant.id} />}
          terms={terms && { url: terms.url, filename: terms.filename }}
        />
      ) : (
        <PhulhaarClosed note={note} />
      )}
    </PhulhaarPage>
  )
}
