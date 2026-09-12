import type { Metadata } from 'next'

import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import React from 'react'

import { LivePreviewListener } from '@/components/LivePreviewListener'
import { Media } from '@/components/Media'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import RichText from '@/components/RichText'
import { Section } from '@/components/Typography'
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

      <header className="pb-[clamp(3rem,6vw,5rem)] pt-[clamp(4rem,9vw,7.5rem)]">
        <div className="container grid gap-x-12 gap-y-5 md:grid-cols-12">
          <div className="md:col-span-3 md:pt-3">
            <Link className="label link" href="/journal">
              Journal
            </Link>
            <p className="label mt-1">
              {post.publishedAt && (
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
              )}
              {categories.map((c) =>
                typeof c === 'object' ? (
                  <span className="block" key={c.id}>
                    {c.title}
                  </span>
                ) : null,
              )}
            </p>
          </div>
          <div className="md:col-span-9">
            <h1 className="display-lg max-w-[22ch]">{post.title}</h1>
            {post.excerpt && <p className="lede measure mt-6">{post.excerpt}</p>}
          </div>
        </div>
      </header>

      {hero && (
        <div className="container pb-[clamp(3rem,6vw,5rem)]">
          <Media
            className="overflow-hidden bg-surface md:ml-[25%]"
            imgClassName="h-auto w-full"
            priority
            resource={hero}
            size="(max-width: 1024px) 100vw, 900px"
          />
        </div>
      )}

      <Section>
        <RichText className="measure" data={post.content} />
        <Link className="link link-caps mt-14 inline-block" href="/journal">
          Back to the journal
        </Link>
      </Section>
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
