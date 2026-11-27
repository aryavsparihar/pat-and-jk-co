import type { Metadata } from 'next'

import Link from '@/components/IntentLink'
import { notFound } from 'next/navigation'
import React from 'react'

import { FounderCredit } from '@/components/house/FounderCredit'
import { FounderSignature } from '@/components/house/FounderSignature'
import { FramedPhulhaar } from '@/components/house/FramedPhulhaar'
import { FOUNDER_PORTRAIT, FOUNDER_PORTRAIT_ALT } from '@/components/house/founder'
import { HouseSection } from '@/components/house/HouseSection'
import { JournalEntry } from '@/components/house/JournalEntry'
import { houseMetadata } from '@/components/house/meta'
import { Thread } from '@/components/house/Thread'
import { getPosts } from '@/utilities/queries'
import { getTenantContext } from '@/utilities/tenant'

type Args = { params: Promise<{ host: string }> }

const WITH_EVERY_WORK = [
  ['Original work only', 'No prints, reproductions or work made with AI.'],
  [
    'Signed by its artist',
    'A certificate of authenticity, signed by the maker, travels with each work.',
  ],
  [
    'Provenance on record',
    'Each work is given its own reference number, so anyone can confirm its provenance online.',
  ],
  ['Fair to artists', 'Clear terms, agreed in writing before a single work is sold.'],
] as const

const WAYS_IN = [
  {
    title: 'Artists and craftspeople',
    body: 'Show us your work. Applications are open, and they are free.',
    href: '/collaborate/artists',
    action: 'Apply as an artist →',
    phulhaar: true,
  },
  {
    title: 'Designers, architects and art advisers',
    body: 'A trade account and designer catalogues for your projects, and curatorial advice, quoted separately, whenever a project calls for it.',
    href: '/collaborate/partners',
    action: 'Apply for a trade account →',
  },
  {
    title: 'Curators',
    body: 'Shape a collection with us, one project at a time.',
    href: '/collaborate/curators',
    action: 'Apply as a guest curator →',
  },
  {
    title: 'Collectors',
    body: 'Looking for a particular work, or one made to commission? Phulhaar Gallery will help.',
    href: '/ventures/phulhaar-gallery',
    action: 'Visit Phulhaar Gallery →',
  },
]

/** Home, as in the founder's design (Main.html; his brief of 25 November 2026, section 3) */
export default async function HomePage({ params }: Args) {
  const { host } = await params
  const ctx = await getTenantContext(host)
  if (!ctx) notFound()
  const [latest] = await getPosts(ctx.tenant.id, { limit: 1 })

  return (
    <div className="house">
      <section className="house-wrap flex flex-col items-center pb-[clamp(4rem,8vw,6rem)] pt-[clamp(3.5rem,7vw,5.5rem)] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- the transparent monogram as given */}
        <img
          alt="PJK monogram"
          className="mb-[clamp(2.5rem,5vw,3.5rem)] block h-auto w-[min(270px,70vw)]"
          height={209}
          src="/brand/pjk-monogram.png"
          width={432}
        />
        <h1 className="mb-7 max-w-[820px] font-display text-[clamp(2.5rem,5.5vw,4rem)] font-normal leading-[1.08] text-primary">
          A house for art and craft, and for the names behind it.
        </h1>
        <p className="mb-10 max-w-[720px] text-[clamp(1.2rem,1.8vw,1.375rem)] leading-[1.65]">
          PAT &amp; J.K. Co. was founded in Kathua, Jammu and Kashmir, in India’s far north, to give
          good work, and the people who make it, their due. Each venture trades under its own name.
          The first is Phulhaar Gallery.
        </p>
        <Link className="house-tl" href="/about">
          About the house
        </Link>
      </section>

      <div className="house-wrap">
        <Thread />
        <HouseSection
          contentClassName="flex flex-wrap items-center gap-12"
          label="Our first venture"
        >
          <div className="flex flex-[1_1_320px] justify-center pb-6 pt-2">
            <FramedPhulhaar />
          </div>
          <div className="flex-[1_1_360px]">
            <h2 className="mb-2.5 font-display text-[clamp(2.1rem,3.6vw,2.875rem)] font-normal leading-[1.1] text-primary">
              Phulhaar Gallery by PJK
            </h2>
            <p className="mb-6 font-display text-[1.375rem] italic">Fine art and craft</p>
            <p className="house-p">
              Works chosen to be lived with, and placed with care. Opening in early 2027 at{' '}
              <a href="https://phulhaar.com" rel="noopener noreferrer" target="_blank">
                phulhaar.com
              </a>
              .
            </p>
            <Link className="house-btn mt-3" href="/ventures/phulhaar-gallery">
              Discover the gallery
            </Link>
          </div>
          <div className="flex-[1_1_100%] border-t border-[#9aa79e] pt-7">
            <h3 className="house-small mb-[22px] font-normal">With every work</h3>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-x-8 gap-y-7">
              {WITH_EVERY_WORK.map(([title, body]) => (
                <li key={title}>
                  <p className="mb-1.5 font-display text-[1.5625rem] text-primary">{title}</p>
                  <p className="house-note m-0 text-[1.0625rem] leading-[1.6]">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </HouseSection>

        <Thread />
        <HouseSection
          contentClassName="flex flex-wrap items-start gap-10"
          label="From the proprietor"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a 19 KB square portrait */}
          <img
            alt={FOUNDER_PORTRAIT_ALT}
            className="size-[150px] flex-none rounded-full object-cover"
            height={528}
            src={FOUNDER_PORTRAIT}
            width={528}
          />
          <div className="min-w-0 flex-[1_1_420px]">
            <h2 className="mb-[26px] font-display text-[clamp(2.25rem,4vw,3.25rem)] font-normal italic leading-[1.12] text-primary">
              A single flower is easily missed.
            </h2>
            <blockquote className="mb-7 max-w-[720px] font-display text-[clamp(1.3rem,2vw,1.5625rem)] leading-normal text-primary">
              <p className="mb-[18px]">
                Strung with others on one thread, it becomes a phulhaar, a garland, and is given
                with meaning.
              </p>
              <p className="mb-[18px]">
                Much of the finest work in this country is that single flower: made in small towns
                and quiet studios, sold without its maker’s name or any record of where it came
                from, and seldom seen by the people who would value it most.
              </p>
              <p className="m-0">
                PJK means to be the thread. Each work keeps its own colour and its maker’s name.
                What we add is the care that holds them together, and a record that stays with every
                piece.
              </p>
            </blockquote>
            <FounderSignature animated className="mb-3.5 ml-[-6px] mt-1.5 w-[300px] max-w-full" />
            <FounderCredit />
            <p className="mt-[18px]">
              <Link className="house-tl" href="/leadership">
                Read more under Leadership
              </Link>
            </p>
          </div>
        </HouseSection>

        {latest && (
          <>
            <Thread />
            <HouseSection label="Journal">
              <h2 className="house-h2">From the Journal</h2>
              <JournalEntry post={latest} />
              <p className="mt-7">
                <Link className="house-tl" href="/journal">
                  Read the Journal
                </Link>
              </p>
            </HouseSection>
          </>
        )}

        <Thread />
        <HouseSection className="pb-[clamp(4rem,8vw,6.875rem)]" label="Work with us">
          <h2 className="house-h2 max-w-[720px]">
            If you make, collect, curate or place art, we would like to hear from you.
          </h2>
          <ul className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
            {WAYS_IN.map((way) => (
              <li
                className={
                  way.phulhaar
                    ? 'flex flex-col gap-[18px] border border-[#e5d6b6] border-t-2 border-t-[#c9952b] bg-[#faf3e5] px-7 py-8'
                    : 'flex flex-col gap-[18px] border border-[#d9d4c8] bg-[#ece7dc] px-7 py-8'
                }
                key={way.title}
              >
                <h3 className="house-small font-normal">{way.title}</h3>
                <p className="m-0 flex-1 text-[1.1875rem] leading-[1.6]">{way.body}</p>
                <Link className="house-tl" href={way.href}>
                  {way.action}
                </Link>
              </li>
            ))}
          </ul>
        </HouseSection>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return houseMetadata(
    host,
    '/',
    'PAT & J.K. Co. — a house for art and craft',
    'A house for art and craft from Kathua, Jammu and Kashmir, in India’s far north. Its first venture is Phulhaar Gallery.',
  )
}
