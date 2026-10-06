import type { Metadata } from 'next'

import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import React from 'react'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { ventureTheme } from '@/brands/themes'
import { ventureStageLabel } from '@/components/cards/VentureCard'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { Media } from '@/components/Media'
import { OpeningNotice } from '@/components/OpeningNotice'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { Plate } from '@/components/Plate'
import { RowArrow } from '@/components/RowArrow'
import RichText from '@/components/RichText'
import { Section } from '@/components/Typography'
import { docPath } from '@/utilities/docHref'
import { applicationsOpenness } from '@/members/openness'
import { generateMeta } from '@/utilities/meta'
import { cn } from '@/utilities/ui'
import { getAllSlugs, getVentureBySlug } from '@/utilities/queries'
import { getTenantByHost, getTenantContext } from '@/utilities/tenant'

type Args = { params: Promise<{ host: string; slug: string }> }

export async function generateStaticParams({ params }: { params: { host: string } }) {
  const tenant = await getTenantByHost(params.host).catch(() => null)
  if (!tenant) return []
  return (await getAllSlugs('ventures', tenant.id)).map((slug) => ({ slug }))
}

export default async function VenturePage({ params }: Args) {
  const { host, slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const { isEnabled: draft } = await draftMode()
  const ctx = await getTenantContext(host)
  if (!ctx) notFound()

  const path = docPath('ventures', slug)
  const venture = await getVentureBySlug(ctx.tenant.id, slug, draft)
  if (!venture || (venture.stage === 'coming-soon' && !draft)) {
    return <PayloadRedirects tenantId={ctx.tenant.id} url={path} />
  }

  const cover = venture.cover && typeof venture.cover === 'object' ? venture.cover : null
  const logo = venture.logo && typeof venture.logo === 'object' ? venture.logo : null
  // A venture with its own theme (Ventures → Theme) is set in that brand's ground, type and colours
  const theme = ventureTheme(venture)
  const invite = theme?.invite
  const open = invite
    ? (await applicationsOpenness(await getPayload({ config: configPromise }))).open
    : false
  const facts = [
    { label: 'Stage', value: ventureStageLabel[venture.stage] },
    ...(venture.sector ? [{ label: 'Field', value: venture.sector }] : []),
    ...(venture.highlights ?? []).map((h) => ({ label: h.label, value: h.value })),
  ]

  return (
    <article className={theme?.className} data-display={theme?.display}>
      {draft && <LivePreviewListener />}

      <header className="pb-[clamp(3rem,6vw,5rem)] pt-[clamp(4rem,9vw,7.5rem)]">
        <div className="container grid gap-x-12 gap-y-5 md:grid-cols-12">
          <div className="md:col-span-3 md:pt-4">
            <Link className="label link" href="/ventures">
              Ventures
            </Link>
          </div>
          <div className="md:col-span-9">
            <h1
              className={cn('display-xl max-w-[16ch]', theme && 'intro-line [--intro-delay:0.05s]')}
            >
              {venture.name}
            </h1>
            {venture.tagline && (
              <p
                className={cn(
                  'mt-5 font-display text-[clamp(1.4rem,2.2vw,1.8rem)] italic text-primary',
                  theme && 'intro-line [--intro-delay:0.25s]',
                )}
              >
                {venture.tagline}
              </p>
            )}
          </div>
        </div>
      </header>

      {cover ? (
        <div className="container pb-[clamp(3rem,6vw,5rem)]">
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface md:aspect-[21/9]">
            <Media fill imgClassName="object-cover" priority resource={cover} size="100vw" />
          </div>
        </div>
      ) : (
        // No photograph yet: the venture's own mark stands as the frontispiece
        logo && (
          <div className="container pb-[clamp(3rem,6vw,5rem)]">
            <div className="mx-auto max-w-[34rem]">
              <div className="relative mx-auto aspect-[5/4] w-full max-w-[30rem]">
                <Plate
                  animate
                  breathe={theme?.breathe}
                  mark={logo}
                  markSize="(max-width: 640px) 92vw, 30rem"
                  priority
                />
              </div>
              {venture.caption && (
                <p className="intro-line mt-10 whitespace-pre-line text-center font-display text-[clamp(1.3rem,2vw,1.6rem)] italic leading-[1.45] text-primary [--intro-delay:1s]">
                  {venture.caption}
                </p>
              )}
              <OpeningNotice
                as="notice"
                className="intro-line mt-11 [--intro-delay:1.2s]"
                opening={venture.opening}
                themeRule={theme?.ruleClassName}
              />
            </div>
          </div>
        )
      )}

      {invite && (
        // The way in for the people this brand works with. Works whether or not applications
        // are open: the page it leads to says which, and what to have ready
        <div className="container pb-[clamp(3rem,6vw,5rem)]">
          <Link
            className="row-link intro-line mx-auto block max-w-[46rem] border border-[color-mix(in_oklab,var(--gold,var(--primary))_35%,transparent)] border-t-2 border-t-[var(--gold,var(--primary))] bg-[var(--background)] p-7 [--intro-delay:1.4s] sm:p-10"
            href={invite.href}
          >
            <span className="label block text-[var(--gold-text,var(--primary))]">
              {invite.label}
            </span>
            <span className="display-md row-title mt-3 block">{invite.heading}</span>
            <span className="measure mt-4 block">{open ? invite.open : invite.closed}</span>
            <span className="link-caps mt-8 flex items-center gap-4">
              {open ? invite.action.open : invite.action.closed}
              <RowArrow />
            </span>
          </Link>
        </div>
      )}

      <Section label="About">
        <div className="grid gap-x-12 gap-y-12 lg:grid-cols-9">
          <div className="lg:col-span-6">
            {venture.summary && <p className="lede">{venture.summary}</p>}
            {venture.description && <RichText className="mt-8" data={venture.description} />}
          </div>
          <aside className="lg:col-span-3">
            <dl className="border-t border-border-strong">
              {facts.map((fact) => (
                <div className="border-b border-border py-4" key={fact.label}>
                  <dt className="label">{fact.label}</dt>
                  <dd className="mt-0.5">{fact.value}</dd>
                </div>
              ))}
            </dl>
            {venture.website && (
              <a
                className="btn btn-solid mt-8"
                href={venture.website}
                rel="noopener noreferrer"
                target="_blank"
              >
                Visit website
              </a>
            )}
          </aside>
        </div>
      </Section>

      <Section label="Enquiries">
        <p className="display-md max-w-[22ch]">
          To ask about {venture.name}, write to us and we will reply personally.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link className="btn btn-solid" href="/contact">
            Get in touch
          </Link>
          <Link className="link link-caps" href="/ventures">
            All ventures
          </Link>
        </div>
      </Section>
    </article>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host, slug } = await params
  const { isEnabled: draft } = await draftMode()
  const ctx = await getTenantContext(host)
  if (!ctx) return {}
  const venture = await getVentureBySlug(ctx.tenant.id, decodeURIComponent(slug), draft)
  return generateMeta({ ctx, doc: venture, path: docPath('ventures', slug) })
}
