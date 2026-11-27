import type { Metadata } from 'next'

import Link from '@/components/IntentLink'
import { notFound } from 'next/navigation'
import React from 'react'

import { phulhaarSocialLinks, SOCIAL_ICON_BODY } from '@/brands/socialIcons'
import { HouseSection } from '@/components/house/HouseSection'
import { houseMetadata } from '@/components/house/meta'
import { getTenantContext } from '@/utilities/tenant'

type Args = { params: Promise<{ host: string }> }

const FACTS = [
  ['Stage', 'Opening in early 2027'],
  ['Field', 'Fine art and craft'],
  ['Website', 'phulhaar.com (from early 2027)'],
  ['Part of', 'PAT & J.K. Co.'],
] as const

const WHO_FOR = [
  [
    'For collectors',
    'Help choosing work you will still want to live with in twenty years, and, if nothing suits, a work made to commission by one of our artists. Every piece arrives with a certificate signed by its artist and a record of where it came from.',
  ],
  [
    'For designers, architects and art advisers',
    'A trade account, with 10% trade pricing on works bought through it and designer catalogues for your clients. Curatorial advice for a project is offered as a separate service, quoted in advance.',
  ],
  [
    'For collections, events and sets',
    'Curatorial support for a private collection or an event, and for a film, stage or photography set: from choosing the work to deciding where it goes, on terms agreed in writing for each project.',
  ],
  [
    'For artists',
    'A gallery that takes your work seriously, presents it with care, and sets out its terms plainly, including your share of each sale, before you sign.',
  ],
] as const

/** Phulhaar's own accounts, in the brief's order; one not yet set in the admin is left out */
const PHULHAAR_SOCIALS = ['instagram', 'pinterest', 'facebook', 'x'] as const

/**
 * Phulhaar Gallery, as in the founder's design (Phulhaar.html; his brief, section 5), on
 * Phulhaar's own cream. There is no buying on PJK: buying, commissions, orders and provenance
 * questions go to phulhaar.com. The "From the first collection" pictures wait until the first
 * artists' works are photographed. Written in code, so it takes the place of the venture page
 * built from the admin for this one venture.
 */
export default async function PhulhaarPage({ params }: Args) {
  const { host } = await params
  const ctx = await getTenantContext(host)
  if (!ctx) notFound()
  const all = phulhaarSocialLinks(ctx.settings?.phulhaarSocial)
  const socials = PHULHAAR_SOCIALS.flatMap((p) => all.filter((s) => s.platform === p))

  return (
    <div className="house bg-[var(--phulhaar-cream)]">
      <div className="house-wrap">
        <nav aria-label="Breadcrumb" className="house-small pt-9 text-[13px]">
          <Link className="!text-[var(--muted-ink)]" href="/ventures">
            Ventures
          </Link>
          <span aria-hidden className="mx-2">
            ›
          </span>
          <span aria-current="page">Phulhaar Gallery</span>
        </nav>

        <section className="flex flex-col items-center pb-[clamp(3.5rem,7vw,5.5rem)] pt-12 text-center">
          <h1 className="mb-4 font-[family-name:var(--font-marcellus)] text-[clamp(2.75rem,6.5vw,4.75rem)] font-normal leading-[1.05] text-primary">
            Phulhaar Gallery by PJK
          </h1>
          <p className="mb-14 font-display text-[1.75rem] italic">Fine art and craft</p>
          <div className="mb-14 max-w-full border border-[#e3d8c2] px-[clamp(1.5rem,4vw,3rem)] py-9">
            {/* eslint-disable-next-line @next/next/no-img-element -- the transparent logo file as given */}
            <img
              alt="Phulhaar logo"
              className="block h-auto w-[320px] max-w-full"
              height={259}
              src="/brand/phulhaar-logo.png"
              width={342}
            />
          </div>
          <p className="house-small mb-3.5 text-[15px]">Phulhaar · said “phool-haar”</p>
          <p className="mb-7 max-w-[600px] font-display text-[clamp(1.4rem,2.4vw,1.75rem)] italic leading-[1.45]">
            The name joins two Hindi words: <span className="not-italic">phool</span>, a flower, and{' '}
            <span className="not-italic">haar</span>, a garland. Every artist it gathers is a bloom
            of their own, and the gallery is the thread that draws them into a single piece of work.
          </p>
          <p className="house-note m-0 font-display text-2xl italic">
            Opening in early 2027 at{' '}
            <a href="https://phulhaar.com" rel="noopener noreferrer" target="_blank">
              phulhaar.com
            </a>
            .
          </p>
        </section>

        <HouseSection contentClassName="flex flex-wrap gap-12" label="About">
          <div className="min-w-0 flex-[999_1_480px]">
            <p className="mb-7 max-w-[680px] font-display text-[clamp(1.4rem,2.4vw,1.75rem)] leading-[1.45] text-primary">
              Phulhaar is a gallery for fine art and craft, and the first venture of PAT &amp; J.K.
              Co. It does two things, and gives each the same care.
            </p>
            <p className="house-p">
              The first is curation: finding work we believe in, and showing it properly. The second
              is placement, which is a different craft altogether. A painting’s life does not end on
              a gallery wall. It begins in earnest in a room, with a light above it, a colour behind
              it and a life going on around it.
            </p>
            <p className="house-p">
              So we work alongside curators, interior designers, architects and stylists as a matter
              of course. Together we settle not only what is bought, but where it should go, what it
              should sit beside, and how the room should feel once it is there. The advice is ours;
              framing and hanging are left to you or your designer.
            </p>
            <p className="house-p">
              Some collections will be shaped with a guest curator, invited for that collection
              alone and credited by name.
            </p>
          </div>
          <aside aria-label="Facts" className="flex-[1_1_240px] border-t border-[#9aa79e]">
            <dl>
              {FACTS.map(([label, value]) => (
                <div className="border-b border-[#e3d8c2] py-[18px]" key={label}>
                  <dt className="house-small mb-1.5 text-xs tracking-[0.16em]">{label}</dt>
                  <dd className="m-0 text-lg">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </HouseSection>

        <HouseSection contentClassName="flex flex-col gap-9" label="Who it is for">
          {WHO_FOR.map(([title, body]) => (
            <div key={title}>
              <h3 className="mb-2 font-display text-[1.6875rem] font-medium text-primary">
                {title}
              </h3>
              <p className="house-p m-0">{body}</p>
            </div>
          ))}
          <div className="mt-3 border border-[#e3cfa3] border-t-2 border-t-[#c9952b] bg-[#fdf8ee] p-[clamp(1.5rem,4vw,2.5rem)]">
            <p className="house-small mb-3 tracking-[0.16em] !text-[#8a6516]">For artists</p>
            <h2 className="mb-4 font-[family-name:var(--font-marcellus)] text-[clamp(1.75rem,3vw,2.25rem)] font-normal text-primary">
              Show your work with Phulhaar
            </h2>
            <p className="house-p">
              Applications are open, and they are free. Tell us about your practice and send a few
              images of your work; you can stop and come back at any time.
            </p>
            <Link className="house-tl" href="/collaborate/artists">
              Apply as an artist →
            </Link>
          </div>
        </HouseSection>

        <HouseSection className="pb-[clamp(4rem,8vw,6.875rem)]" label="Enquiries">
          <h2 className="house-h2 max-w-[700px]">
            Write to us about Phulhaar Gallery. Every message is answered personally.
          </h2>
          <p className="house-p">
            Buying a work, commissioning one, and questions about an order are handled on Phulhaar’s
            own site,{' '}
            <a href="https://phulhaar.com" rel="noopener noreferrer" target="_blank">
              phulhaar.com
            </a>
            , which opens in early 2027.
          </p>
          <div className="flex flex-wrap items-center gap-7">
            <Link className="house-btn" href="/contact">
              Make an enquiry
            </Link>
            <Link className="house-tl" href="/ventures">
              All ventures
            </Link>
          </div>
          {socials.length > 0 && (
            <div className="mt-9 flex flex-wrap items-center gap-3.5">
              <span className="house-small mr-1.5 tracking-[0.16em]">Follow Phulhaar</span>
              {socials.map((social) => (
                <a
                  aria-label={`Phulhaar Gallery on ${social.label} (opens in a new tab)`}
                  className="flex size-11 items-center justify-center rounded-full border border-[#e3cfa3] transition-colors hover:border-[#c9952b]"
                  href={social.url}
                  key={social.platform}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <svg
                    aria-hidden
                    className="size-5"
                    dangerouslySetInnerHTML={{ __html: SOCIAL_ICON_BODY[social.platform] }}
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  />
                </a>
              ))}
            </div>
          )}
        </HouseSection>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return houseMetadata(
    host,
    '/ventures/phulhaar-gallery',
    'Phulhaar Gallery by PJK',
    'Phulhaar is a gallery for fine art and craft, and the first venture of PAT & J.K. Co. Opening in early 2027 at phulhaar.com.',
  )
}
