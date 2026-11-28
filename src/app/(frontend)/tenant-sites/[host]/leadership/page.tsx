import type { Metadata } from 'next'

import Link from '@/components/IntentLink'
import React from 'react'

import {
  FOUNDER_NAME,
  FOUNDER_PORTRAIT,
  FOUNDER_PORTRAIT_ALT,
  FOUNDER_TITLES,
} from '@/components/house/founder'
import { HouseSection } from '@/components/house/HouseSection'
import { houseMetadata } from '@/components/house/meta'

type Args = { params: Promise<{ host: string }> }

/** Leadership, as in the founder's design (Leadership.html; his brief, section 6) */
export default function LeadershipPage() {
  return (
    <div className="house">
      <div className="house-wrap">
        <HouseSection hero label="Leadership">
          <h1 className="house-h1">Who leads the house</h1>
          <p className="house-lead m-0">
            PAT &amp; J.K. Co. is led from Kathua, in India’s far north, by its proprietor.
          </p>
        </HouseSection>

        <HouseSection contentClassName="flex flex-wrap items-start gap-12" label="Proprietor">
          {/* eslint-disable-next-line @next/next/no-img-element -- a 19 KB square portrait */}
          <img
            alt={FOUNDER_PORTRAIT_ALT}
            className="size-[min(264px,60vw)] flex-none rounded-full object-cover"
            height={528}
            src={FOUNDER_PORTRAIT}
            width={528}
          />
          <div className="min-w-0 flex-[1_1_420px]">
            <h2 className="house-h2 mb-2">{FOUNDER_NAME}</h2>
            <p className="house-small mb-[22px] text-sm leading-[1.7] tracking-[0.16em]">
              {FOUNDER_TITLES[0]}
              <br />
              {FOUNDER_TITLES[1]}
            </p>
            <p className="house-p">
              {FOUNDER_NAME} founded PJK in Kathua and owns it as its proprietor. He came to art
              from the sciences and brought one habit with him: a work’s history should be written
              down before its price is agreed. Much of the art trade still rests on a dealer’s word
              and a story told at the point of sale, so at PJK each work is recorded from the day it
              leaves the studio, and whoever owns it later can trace it back to its artist.
            </p>
            <p className="house-p">
              Phulhaar Gallery, the house’s first venture, which he founded and leads as Creative
              Director, takes its name from the garland, and from the way he believes a gallery
              should work: each artist kept distinct, the gallery the thread that holds them
              together. There he makes sure every piece leaves its maker’s studio with its
              provenance on record and a fair price paid to the artist.
            </p>
          </div>
        </HouseSection>

        <HouseSection className="pb-[clamp(4rem,8vw,6.875rem)]" label="Join us">
          <h2 className="house-h2">We are a small team, and we grow carefully.</h2>
          <Link className="house-tl" href="/collaborate#openings">
            See current openings →
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
    '/leadership',
    'Leadership',
    `PAT & J.K. Co. is led from Kathua, in India’s far north, by its proprietor, ${FOUNDER_NAME}.`,
  )
}
