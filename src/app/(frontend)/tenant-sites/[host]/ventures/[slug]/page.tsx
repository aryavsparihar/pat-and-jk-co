import type { Metadata } from 'next'

import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import React from 'react'

import { CtaBandBlock } from '@/blocks/CtaBand/Component'
import { ventureMotif, ventureStatusLabel } from '@/components/cards/VentureCard'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { Media } from '@/components/Media'
import { MotifPanel } from '@/components/MotifPanel'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { Reveal } from '@/components/Reveal'
import RichText from '@/components/RichText'
import { docPath } from '@/utilities/docHref'
import { generateMeta } from '@/utilities/meta'
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
  const motif = ventureMotif(venture.name)
  const facts = [
    { label: 'Stage', value: ventureStatusLabel[venture.stage] },
    ...(venture.sector ? [{ label: 'Focus', value: venture.sector }] : []),
    ...(venture.highlights ?? []).map((h) => ({ label: h.label, value: h.value })),
  ]

  return (
    <article>
      {draft && <LivePreviewListener />}

      <header className="container pb-14 pt-[clamp(3.5rem,8vw,6.5rem)]">
        <nav aria-label="Breadcrumb" className="animate-rise">
          <Link className="eyebrow transition-colors hover:text-primary" href="/ventures">
            ← All ventures
          </Link>
        </nav>
        <h1 className="display-xl animate-rise mt-8 max-w-[16ch] [animation-delay:100ms]">
          {venture.name}
        </h1>
        {venture.tagline && (
          <p className="animate-rise mt-6 font-serif text-[clamp(1.4rem,2.4vw,1.9rem)] italic text-primary [animation-delay:180ms]">
            {venture.tagline}
          </p>
        )}
      </header>

      <div className="container">
        <div className="animate-rise relative aspect-[16/9] w-full overflow-hidden [animation-delay:260ms] md:aspect-[21/9]">
          {cover ? (
            <Media fill imgClassName="object-cover" priority resource={cover} size="100vw" />
          ) : (
            <MotifPanel size="lg" subtitle={motif.subtitle} title={motif.title} />
          )}
        </div>
      </div>

      <section className="section">
        <div className="container grid gap-x-20 gap-y-14 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            {venture.summary && (
              <p className="font-serif text-[clamp(1.45rem,2.2vw,1.9rem)] leading-snug">
                {venture.summary}
              </p>
            )}
            {venture.description && <RichText className="rt-lg mt-10" data={venture.description} />}
          </Reveal>

          <Reveal as="div" className="lg:col-span-4 lg:col-start-9" delay={120}>
            <aside className="lg:sticky lg:top-32">
              <dl className="divide-y divide-border border-y border-border">
                {facts.map((fact) => (
                  <div className="flex items-baseline justify-between gap-6 py-5" key={fact.label}>
                    <dt className="eyebrow">{fact.label}</dt>
                    <dd className="text-right font-serif text-xl">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              {venture.website && (
                <a
                  className="btn btn-solid mt-8 w-full"
                  href={venture.website}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Visit website{' '}
                  <span aria-hidden className="arrow">
                    ↗
                  </span>
                </a>
              )}
            </aside>
          </Reveal>
        </div>
      </section>

      <CtaBandBlock
        blockType="ctaBand"
        eyebrow="Work with us"
        heading={`Interested in *${motif.title}*?`}
        links={[
          {
            link: { type: 'custom', url: '/contact', label: 'Get in touch', appearance: 'default' },
          },
          {
            link: {
              type: 'custom',
              url: '/ventures',
              label: 'All ventures',
              appearance: 'outline',
            },
          },
        ]}
        text="We would be glad to hear from collectors, artists and partners."
        tone="surface"
      />
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
