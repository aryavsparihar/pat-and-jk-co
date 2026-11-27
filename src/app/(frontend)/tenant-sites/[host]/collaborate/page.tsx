import type { Metadata } from 'next'

import Link from '@/components/IntentLink'
import React from 'react'

import { HouseSection } from '@/components/house/HouseSection'
import { houseMetadata } from '@/components/house/meta'

type Args = { params: Promise<{ host: string }> }

const TRADE_TERMS = [
  [
    'I',
    'Trade pricing',
    'Original works bought through your registered trade account carry 10% off the listed price. Shipping, crating and taxes are charged in full, and trade pricing is not combined with other offers.',
  ],
  [
    'II',
    'Material for your clients',
    'Catalogues and tear sheets to show your clients. Where a project calls for more, our curators can advise on what will suit it and where each work should hang, as a separate service quoted before we begin.',
  ],
  [
    'III',
    'Your client stays yours',
    'You bill your client in your own way. We ask only that no work is advertised publicly for less than its price on Phulhaar.',
  ],
  [
    'IV',
    'Credit where the work is shown',
    'Photograph finished projects for your portfolio and the press, crediting the work as “Artwork courtesy of Phulhaar Gallery”. Each work reaches your client with its signed certificate and reference number intact.',
  ],
] as const

const STEPS = [
  [
    'I',
    'Apply',
    'Tell us about yourself and your work online. Your application saves as you go, so you can stop and come back to it.',
  ],
  [
    'II',
    'Review',
    'We read every application ourselves. If it is a good fit, we will be in touch to talk it through, or to ask a question or two.',
  ],
  [
    'III',
    'Agreement',
    'If we go ahead, we first confirm who you are, with your PAN or passport and a photo of you (artists also add a second ID showing their address). Then we send our agreement to read and sign online. Nothing is final until we have both signed.',
  ],
  ['IV', 'Welcome', 'You receive your own member ID and account, and we begin.'],
] as const

const Rows: React.FC<{ rows: readonly (readonly [string, string, string])[] }> = ({ rows }) => (
  <ol className="border-t border-[#9aa79e]">
    {rows.map(([number, title, body]) => (
      <li className="house-row" key={number}>
        <span aria-hidden className="house-num">
          {number}
        </span>
        <h3 className="house-rt m-0 flex-[1_1_220px] font-normal">{title}</h3>
        <p className="house-rb flex-[2_1_380px]">{body}</p>
      </li>
    ))}
  </ol>
)

const card =
  'flex flex-col items-center gap-5 px-[clamp(1.5rem,3vw,2.25rem)] py-10 text-center border'
const cardText =
  'm-0 flex-1 self-stretch text-[1.1875rem] leading-[1.6] [hyphens:auto] [text-align-last:center] text-justify'
const logoBand = 'flex h-[72px] w-full items-center justify-center'

/**
 * Work with us, still at /collaborate, which the agreements cite (the founder's design,
 * WorkWithUs.html; his brief, section 7): three ways to begin, what a trade account brings, the
 * four steps, the openings and where to write when unsure.
 */
export default function CollaborateIndex() {
  return (
    <div className="house">
      <div className="house-wrap">
        <HouseSection hero label="Work with us">
          <h1 className="house-h1">Work with us</h1>
          <p className="house-lead m-0">
            There are three ways to begin: as an artist whose work belongs in Phulhaar Gallery, as a
            designer, architect or art adviser placing art for clients, or as a curator who would
            like to shape a collection with us.
          </p>
        </HouseSection>

        <HouseSection label="Apply">
          <h2 className="house-h2">Three ways to begin</h2>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            <li
              className={`${card} border-[#e3cfa3] border-t-2 border-t-[#c9952b] bg-[var(--phulhaar-cream)]`}
            >
              <div className={logoBand}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a small ornament */}
                <img
                  alt=""
                  className="block h-[68px] w-auto"
                  height={68}
                  src="/brand/wreath.png"
                  width={44}
                />
              </div>
              <h3 className="m-0 font-display text-4xl font-normal text-primary">Artists</h3>
              <p className={cardText}>
                Show and sell your work through Phulhaar Gallery. Applications are free and open all
                year. Your share of each sale is set out in the agreement, before you sign.
              </p>
              <p className="house-small m-0">Free · About fifteen minutes</p>
              <Link className="house-tl" href="/collaborate/artists">
                Apply as an artist →
              </Link>
            </li>
            <li className={`${card} border-[#d9d4c8] bg-[#ece7dc]`}>
              <div className={logoBand}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the transparent monogram */}
                <img
                  alt="PJK"
                  className="block h-[50px] w-auto"
                  height={209}
                  src="/brand/pjk-monogram.png"
                  width={432}
                />
              </div>
              <h3 className="m-0 font-display text-4xl font-normal text-primary">Trade partners</h3>
              <p className={cardText}>
                For interior designers, architects, art advisers, dealers and hospitality specifiers
                who buy or specify art for their clients. Works bought through a registered trade
                account carry 10% trade pricing, and the account brings designer catalogues. When a
                project needs a curator’s eye, we offer that too, quoted separately.
              </p>
              <p className="house-small m-0">Free · About five minutes</p>
              <Link className="house-tl" href="/collaborate/partners">
                Apply for a trade account →
              </Link>
              <a className="-mt-2 text-base" href="#trade">
                What the account brings
              </a>
            </li>
            <li className={`${card} border-[#d9d4c8] bg-[#ece7dc]`}>
              <div className={`${logoBand} gap-5`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the transparent logo */}
                <img
                  alt="Phulhaar Gallery"
                  className="block h-16 w-auto"
                  height={259}
                  src="/brand/phulhaar-logo.png"
                  width={342}
                />
                <span aria-hidden className="h-10 w-px bg-[#c9c3b5]" />
                {/* eslint-disable-next-line @next/next/no-img-element -- the transparent monogram */}
                <img
                  alt="PJK"
                  className="block h-[38px] w-auto"
                  height={209}
                  src="/brand/pjk-monogram.png"
                  width={432}
                />
              </div>
              <h3 className="m-0 font-display text-4xl font-normal text-primary">Guest curators</h3>
              <p className={cardText}>
                Shape a collection for Phulhaar Gallery, or help choose art for a private
                collection, an event or a film, stage or photography set. One project at a time,
                agreed in writing and paid per project.
              </p>
              <p className="house-small m-0">Free · About ten minutes · No account needed</p>
              <Link className="house-tl" href="/collaborate/curators">
                Apply as a guest curator →
              </Link>
            </li>
          </ul>
          <p className="mt-7 text-lg">
            <Link href="/collaborate/signin">
              Already applied as an artist or trade partner? Sign in to see where your application
              has got to.
            </Link>
          </p>
          <p className="mt-2.5 text-base text-[var(--muted-ink)]">
            Guest curators hear from us by email, quoting their CA number.
          </p>
        </HouseSection>

        <HouseSection id="trade" label="For the trade">
          <h2 className="house-h2 mb-3">For designers, architects and art advisers</h2>
          <p className="house-p mb-7">
            A trade account is for professionals who buy or specify art for their clients’ homes,
            offices and hotels. This is what it brings, and the little we ask in return.
          </p>
          <Rows rows={TRADE_TERMS} />
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3.5">
            <Link className="house-tl" href="/collaborate/partners">
              Apply for a trade account →
            </Link>
            <span className="text-base text-[var(--muted-ink)]">
              Buying for your own home?{' '}
              <Link href="/ventures/phulhaar-gallery">Phulhaar Gallery</Link> will help.
            </span>
          </div>
        </HouseSection>

        <HouseSection label="How it works">
          <h2 className="house-h2 mb-3">Four steps, at your own pace</h2>
          <p className="house-p mb-7 text-[var(--muted-ink)]">
            For artists and trade partners. Guest curators send one short form, and we take it from
            there by email.
          </p>
          <Rows rows={STEPS} />
        </HouseSection>

        <HouseSection id="openings" label="Openings">
          <h2 className="house-h2">Current openings</h2>
          <div className="border-t border-[#9aa79e]">
            <div className="house-row py-9">
              <div className="flex-[1_1_200px]">
                <p className="house-small m-0">Collaboration</p>
                <p className="house-note mt-1.5 text-[17px] italic">Project-based, remote</p>
              </div>
              <div className="flex-[2_1_420px]">
                <h3 className="mb-3 font-display text-[1.75rem] font-medium text-primary">
                  Design and technology collaborators
                </h3>
                <p className="house-p">
                  We are building the websites and systems that every venture under PAT &amp; J.K.
                  Co. will share. Designers and engineers who care about detail are welcome to write
                  to us.
                </p>
                <Link className="house-tl" href="/contact?about=working-for-pjk">
                  Express interest
                </Link>
              </div>
            </div>
          </div>
        </HouseSection>

        <HouseSection className="pb-[clamp(4rem,8vw,6.875rem)]" label="Elsewhere">
          <h2 className="house-h2 mb-4">Not sure where you fit?</h2>
          <p className="house-p">Write to us, and we will point you in the right direction.</p>
          <Link className="house-tl" href="/contact">
            Contact us
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
    '/collaborate',
    'Work with us',
    'Three ways to begin with PAT & J.K. Co.: as an artist, as a trade partner, or as a guest curator.',
  )
}
