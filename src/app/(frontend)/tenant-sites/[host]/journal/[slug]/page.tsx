import type { Metadata } from 'next'

import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import React from 'react'

import { LivePreviewListener } from '@/components/LivePreviewListener'
import { Media } from '@/components/Media'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import RichText from '@/components/RichText'
import { Ornament } from '@/components/Typography'
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
  const categories = (post.categories ?? []).filter((c) => typeof c === 'object')

  return (
    <article>
      {draft && <LivePreviewListener />}

      <header className="container-narrow pb-12 pt-[clamp(3.5rem,8vw,6.5rem)] text-center">
        <nav aria-label="Breadcrumb" className="animate-rise">
          <Link className="eyebrow transition-colors hover:text-primary" href="/journal">
            ← Journal
          </Link>
        </nav>
        <h1 className="display-lg animate-rise mt-8 [animation-delay:100ms]">{post.title}</h1>
        <p className="eyebrow animate-rise mt-7 [animation-delay:180ms]">
          {post.publishedAt && (
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          )}
          {categories.map((c) =>
            typeof c === 'object' ? <span key={c.id}> · {c.title}</span> : null,
          )}
        </p>
        {post.excerpt && (
          <p className="lede animate-rise mx-auto mt-7 max-w-xl [animation-delay:240ms]">
            {post.excerpt}
          </p>
        )}
        <Ornament className="animate-rise mt-12 max-w-xs [animation-delay:300ms]" rule />
      </header>

      {hero && (
        <div className="container max-w-5xl">
          <Media
            className="overflow-hidden bg-surface"
            imgClassName="h-auto w-full"
            priority
            resource={hero}
            size="(max-width: 1024px) 100vw, 1024px"
          />
        </div>
      )}

      <div className="container-narrow section-tight">
        <RichText className="rt-lg" data={post.content} />
        <div className="mt-16 border-t border-border pt-8">
          <Link className="btn-text" href="/journal">
            <span aria-hidden className="arrow rotate-180">
              →
            </span>
            Back to the journal
          </Link>
        </div>
      </div>
    </article>
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
