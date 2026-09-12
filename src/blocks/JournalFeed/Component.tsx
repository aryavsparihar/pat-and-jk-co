import type { JournalFeedBlock as JournalFeedBlockProps } from '@/payload-types'

import { PostCard } from '@/components/cards/PostCard'
import { Reveal } from '@/components/Reveal'
import { SectionHeader } from '@/components/Typography'
import { getPosts } from '@/utilities/queries'
import Link from 'next/link'
import React from 'react'

import type { BlockContext } from '../types'

export const JournalFeedBlock = async ({
  eyebrow,
  heading,
  intro,
  limit,
  showViewAll,
  categories,
  emptyMessage,
  ctx,
}: JournalFeedBlockProps & { ctx: BlockContext }) => {
  const categoryIds = (categories ?? []).map((c) => (typeof c === 'object' ? c.id : c))
  const posts = await getPosts(ctx.tenantId, { limit: limit ?? 3, categoryIds })

  return (
    <section className="section">
      <div className="container">
        <Reveal className="mb-16 flex flex-wrap items-end justify-between gap-8">
          <SectionHeader eyebrow={eyebrow} heading={heading} intro={intro} />
          {showViewAll && posts.length > 0 && (
            <Link className="btn-text" href="/journal">
              View all{' '}
              <span aria-hidden className="arrow">
                →
              </span>
            </Link>
          )}
        </Reveal>

        {posts.length > 0 ? (
          <div className="grid gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, i) => (
              <Reveal delay={i * 100} key={post.id}>
                <PostCard post={post} />
              </Reveal>
            ))}
          </div>
        ) : (
          <p className="font-serif text-2xl italic text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </section>
  )
}
