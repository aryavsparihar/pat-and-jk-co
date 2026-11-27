import type { Metadata } from 'next'

import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from '@/components/IntentLink'
import React from 'react'

import { LivePreviewListener } from '@/components/LivePreviewListener'
import { Media } from '@/components/Media'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import RichText from '@/components/RichText'
import { FounderCredit } from '@/components/house/FounderCredit'
import { FounderSignature } from '@/components/house/FounderSignature'
import { postLine } from '@/components/house/JournalEntry'
import { docPath } from '@/utilities/docHref'
import { formatDate } from '@/utilities/formatDateTime'
import { generateMeta } from '@/utilities/meta'
import { getAllSlugs, getPostBySlug } from '@/utilities/queries'
import { getTenantByHost, getTenantContext } from '@/utilities/tenant'

type Args = { params: Promise<{ host: string; slug: string }> }

export async function generateStaticParams({ params }: { params: { host: string } }) {
  const tenant = await getTenantByHost(params.host).catch(() => null)
  if (!tenant) return []
  return (await getAllSlugs('posts', tenant.id)).map((slug) => ({ slug }))
}

export default async function JournalPost({ params }: Args) {
  const { host, slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const { isEnabled: draft } = await draftMode()
  const ctx = await getTenantContext(host)
  if (!ctx) notFound()

  const path = docPath('posts', slug)
  const post = await getPostBySlug(ctx.tenant.id, slug, draft)
  if (!post) return <PayloadRedirects tenantId={ctx.tenant.id} url={path} />

  const hero = post.heroImage && typeof post.heroImage === 'object' ? post.heroImage : null

  return (
    <div className="house">
      {draft && <LivePreviewListener />}
      <div className="house-wrap">
        <header className="flex flex-wrap gap-8 pb-16 pt-[clamp(3.5rem,7vw,5.5rem)]">
          <div className="flex flex-[1_1_200px] flex-col gap-2 pt-3">
            <Link className="house-small !text-[var(--muted-ink)] !no-underline" href="/journal">
              Journal
            </Link>
            {post.publishedAt && (
              <time className="house-small" dateTime={post.publishedAt}>
                {formatDate(post.publishedAt)}
              </time>
            )}
            <span className="house-small">{postLine(post)}</span>
          </div>
          <div className="min-w-0 flex-[999_1_640px]">
            <h1 className="mb-7 font-display text-[clamp(2.75rem,6vw,4.5rem)] font-normal leading-[1.05] text-primary">
              {post.title}
            </h1>
            {post.excerpt && <p className="house-lead m-0">{post.excerpt}</p>}
          </div>
        </header>

        {hero && (
          <div className="pb-[clamp(3rem,6vw,5rem)]">
            <Media
              className="overflow-hidden bg-surface md:ml-[25%]"
              imgClassName="h-auto w-full"
              priority
              resource={hero}
              size="(max-width: 1024px) 100vw, 900px"
            />
          </div>
        )}

        <section className="flex flex-wrap gap-8 border-t border-[var(--rule)] pb-[clamp(4rem,8vw,6.875rem)] pt-[clamp(3rem,6vw,4.5rem)]">
          <div aria-hidden className="flex-[1_1_200px]" />
          <article className="min-w-0 max-w-[680px] flex-[999_1_640px]">
            <RichText className="house-post" data={post.content} />
            {post.signedByProprietor && (
              <div className="mt-11">
                <FounderSignature className="mb-2.5 ml-[-6px] w-[260px] max-w-full" />
                <FounderCredit titleSize="text-[17px]" />
              </div>
            )}
            <p className="mt-14">
              <Link className="house-tl" href="/journal">
                Back to the Journal
              </Link>
            </p>
          </article>
        </section>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host, slug } = await params
  const { isEnabled: draft } = await draftMode()
  const ctx = await getTenantContext(host)
  if (!ctx) return {}
  const post = await getPostBySlug(ctx.tenant.id, decodeURIComponent(slug), draft)
  return generateMeta({ ctx, doc: post, path: docPath('posts', slug) })
}
