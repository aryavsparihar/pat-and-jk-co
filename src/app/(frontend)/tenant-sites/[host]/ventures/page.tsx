import type { Metadata } from 'next'

import Link from '@/components/IntentLink'
import React from 'react'

import { HouseSection } from '@/components/house/HouseSection'
import { houseMetadata } from '@/components/house/meta'

type Args = { params: Promise<{ host: string }> }

/**
 * Ventures, as in the founder's design (Ventures.html; his brief, section 5): Phulhaar alone,
 * with what it is and when it opens. (Earlier this file only handed /ventures to the CMS page;
 * ventures that are not ready stay off the site, as before.)
 */
export default function VenturesIndex() {
  return (
    <div className="house">
      <div className="house-wrap">
        <HouseSection hero label="Ventures">
          <h1 className="house-h1">Our ventures</h1>
          <p className="house-lead m-0">
            The ventures of PAT &amp; J.K. Co., in the order they open.
          </p>
        </HouseSection>

        <HouseSection className="pb-[clamp(4rem,8vw,6.875rem)]" label="Index">
          <Link
            className="house-card-link flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-t-2 border-b-[#d9d4c8] border-t-[#c9952b] bg-[#faf3e5] px-6 py-8"
            href="/ventures/phulhaar-gallery"
          >
            <span className="flex-[0_0_32px] text-[15px] text-[#b23a6b]">01</span>
            <div className="min-w-0 flex-[1_1_360px]">
              <h2 className="house-card-title mb-1.5 font-display text-[clamp(1.75rem,3vw,2.125rem)] font-normal leading-[1.15] text-primary">
                Phulhaar Gallery by PJK
              </h2>
              <p className="house-note m-0 text-lg">Fine art and craft</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a 44px ornament */}
            <img alt="" className="h-auto w-11" height={68} src="/brand/wreath.png" width={44} />
            <span className="house-small whitespace-nowrap">Opening early 2027 →</span>
          </Link>
        </HouseSection>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return houseMetadata(
    host,
    '/ventures',
    'Ventures',
    'The ventures of PAT & J.K. Co., in the order they open. The first is Phulhaar Gallery, for fine art and craft.',
  )
}
