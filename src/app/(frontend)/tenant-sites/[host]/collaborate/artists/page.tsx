import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { ArtistOnboarding } from '@/components/onboarding/ArtistOnboarding'
import { PhulhaarClosed } from '@/components/phulhaar/PhulhaarClosed'
import { PhulhaarPage } from '@/components/phulhaar/PhulhaarPage'
import { phulhaarDisplayFor } from '@/brands/phulhaar'
import { createFormToken } from '@/members/formToken'
import { applicationsOpenness } from '@/members/openness'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

const ABOUT =
  'Phulhaar Gallery by PJK shows fine and contemporary art, chosen with care and placed with people who will live with it.'

// Rendered per request: the page carries a fresh form token and a per-request script nonce
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Apply as an artist',
  description: 'Apply to show and sell your work with Phulhaar Gallery by PJK.',
}

export default async function ArtistApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ display?: string }>
}) {
  await headers()
  const display = phulhaarDisplayFor((await searchParams).display)
  const { open, note } = await applicationsOpenness(await getPayload({ config: configPromise }))
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
      {open ? <ArtistOnboarding formToken={createFormToken()} /> : <PhulhaarClosed note={note} />}
    </PhulhaarPage>
  )
}
