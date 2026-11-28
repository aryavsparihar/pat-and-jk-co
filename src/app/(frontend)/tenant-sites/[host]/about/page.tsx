import type { Metadata } from 'next'

import Link from '@/components/IntentLink'
import React from 'react'

import { FOUNDER_NAME, FOUNDER_PORTRAIT, FOUNDER_PORTRAIT_ALT } from '@/components/house/founder'
import { HouseSection } from '@/components/house/HouseSection'
import { houseMetadata } from '@/components/house/meta'
import { Thread } from '@/components/house/Thread'

type Args = { params: Promise<{ host: string }> }

const PRINCIPLES = [
  [
    'I',
    'New names beside established ones.',
    'Phulhaar shows artists early in their careers alongside names that are already established, and gives both the same care and the same terms. We judge the work in front of us rather than the list of shows behind it, and every piece comes with an account of who made it and why we chose it.',
  ],
  [
    'II',
    'Care in the small things.',
    'The paper of a certificate, the wording on a label, the way a work is photographed and described.',
  ],
  [
    'III',
    'A record that travels with every work.',
    'Each work carries a certificate signed by its artist, a digital record and a reference number of its own, so its history goes wherever it goes.',
  ],
  [
    'IV',
    'Plain dealing.',
    'We say what we mean, price fairly and keep our word, with artists, partners and collectors alike.',
  ],
] as const

/** About, as in the founder's design (About.html; his brief, section 4) */
export default function AboutPage() {
  return (
    <div className="house">
      <div className="house-wrap">
        <HouseSection hero label="About">
          <h1 className="house-h1">
            About <span className="whitespace-nowrap">PAT &amp; J.K. Co.</span>
          </h1>
          <p className="house-lead">
            A house in Kathua, in India’s far north, for ventures in art and craft, and for the
            people whose work they carry.
          </p>
        </HouseSection>

        <Thread />
        <HouseSection label="Our story">
          <h2 className="house-h2">How it began</h2>
          <p className="house-lead">
            PAT &amp; J.K. Co. was founded in Kathua by {FOUNDER_NAME}, from a plain observation:
            good work made far from the large cities is too often sold without its maker’s name, or
            any record of where it came from.
          </p>
          <p className="house-p">
            The answer lies in the name of the house’s first venture. A phulhaar is a garland: every
            flower distinct, all of them held by a single thread. Phulhaar Gallery works the same
            way. The artists remain themselves; the gallery is the thread, choosing with care,
            describing honestly and keeping a record that stays with each work.
          </p>
          <p className="house-p">
            Before a single work was offered for sale, that thread was put in place: agreements that
            are fair to artists, certificates signed by the artist, and a recorded provenance for
            every work.
          </p>
        </HouseSection>

        <Thread />
        <HouseSection label="The house">
          <h2 className="house-h2">How the house is run</h2>
          <p className="house-lead">
            PJK is the house. Each venture is a business within it, trading under its own name;
            Phulhaar Gallery is the first.
          </p>
          <p className="house-p">
            The house holds what every venture depends on and the public seldom sees: the
            agreements, the accounts, the systems behind each website, and the principles set out
            below. Those principles apply to every venture, and to every artist, partner and client
            each one deals with.
          </p>
          <p className="house-p">
            Whichever name you deal with, your agreement is with PAT &amp; J.K. Co., and the house
            answers for it. New ventures are added only once the one before is established.
          </p>
          <p className="house-p">
            The house also works with guest curators, one project at a time, on collections for
            Phulhaar. Curatorial support is offered beyond the gallery too, for a private collection
            or an event, and for a film, stage or photography set, from choosing the work to
            deciding where it goes.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
            <Link className="house-tl" href="/ventures">
              See our ventures
            </Link>
            <Link className="house-tl" href="/collaborate/curators">
              Curate with us
            </Link>
            <Link className="house-tl" href="/contact?about=curatorial-collection">
              Ask about curatorial support
            </Link>
          </p>
        </HouseSection>

        <Thread />
        <HouseSection label="Principles">
          <h2 className="house-h2">What we hold to</h2>
          <ol className="border-t border-[#9aa79e]">
            {PRINCIPLES.map(([number, title, body]) => (
              <li className="house-row" key={number}>
                <span aria-hidden className="house-num">
                  {number}
                </span>
                <h3 className="house-rt m-0 font-normal">{title}</h3>
                <p className="house-rb">{body}</p>
              </li>
            ))}
          </ol>
        </HouseSection>

        <Thread />
        <HouseSection
          className="pb-[clamp(4rem,8vw,6.875rem)]"
          contentClassName="flex flex-wrap items-center gap-9"
          label="Leadership"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a 19 KB square portrait */}
          <img
            alt={FOUNDER_PORTRAIT_ALT}
            className="size-[140px] rounded-full object-cover"
            height={528}
            src={FOUNDER_PORTRAIT}
            width={528}
          />
          <div className="flex-[1_1_400px]">
            <h2 className="house-h2 mb-4">{FOUNDER_NAME}</h2>
            <p className="house-p">
              Proprietor of PAT &amp; J.K. Co., and Founder and Creative Director of Phulhaar
              Gallery.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-7">
              <Link className="house-btn" href="/leadership">
                Leadership
              </Link>
              <Link className="house-tl" href="/contact">
                Contact us
              </Link>
            </div>
          </div>
        </HouseSection>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return houseMetadata(
    host,
    '/about',
    'About',
    'A house in Kathua, in India’s far north, for ventures in art and craft, and for the people whose work they carry.',
  )
}
