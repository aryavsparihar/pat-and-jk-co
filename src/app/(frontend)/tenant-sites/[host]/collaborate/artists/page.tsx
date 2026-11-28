import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { ArtistOnboarding } from '@/components/onboarding/ArtistOnboarding'
import { ApplyHero } from '@/components/onboarding/ApplyFrame'
import { PhulhaarClosed } from '@/components/phulhaar/PhulhaarClosed'
import { phulhaarSocialLinks } from '@/brands/socialIcons'
import { createFormToken } from '@/members/formToken'
import { applicationsOpenness, defaultSiteSettings } from '@/members/openness'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

import { getTenantContext } from '@/utilities/tenant'

// Rendered per request: the page carries a fresh form token and a per-request script nonce
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Apply as an artist',
  description: 'Apply to show and sell your work with Phulhaar Gallery by PJK.',
}

export default async function ArtistApplicationPage({
  params,
}: {
  params: Promise<{ host: string }>
}) {
  await headers()
  const ctx = await getTenantContext((await params).host)
  if (!ctx) notFound()
  const payload = await getPayload({ config: configPromise })
  const { open, note } = await applicationsOpenness(payload)
  const socials = phulhaarSocialLinks((await defaultSiteSettings(payload))?.phulhaarSocial)
  // The founder's designs (Apply1 to Apply5, ApplySent), in the house frame of the other pages
  return (
    <div className="house apply">
      <div className="house-wrap">
        {open ? (
          <ArtistOnboarding formToken={createFormToken()} socials={socials} />
        ) : (
          <>
            <ApplyHero />
            <section className="house-sec border-t border-[#e3cfa3]">
              <div className="house-lab" />
              <div className="house-con max-w-[780px]">
                <PhulhaarClosed note={note} />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
