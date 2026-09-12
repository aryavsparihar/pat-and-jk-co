import type { JournalFeedBlock as JournalFeedBlockProps } from '@/payload-types'

import { PostRow } from '@/components/cards/PostCard'
import { Section, SectionHeading } from '@/components/Typography'
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
    <Section label={eyebrow}>
      <SectionHeading heading={heading} intro={intro} />
      {posts.length > 0 ? (
        <ol className="border-t border-border-strong">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </ol>
      ) : (
        <p className="muted italic">{emptyMessage}</p>
      )}
      {showViewAll && posts.length > 0 && (
        <Link className="link link-caps mt-8 inline-block" href="/journal">
          All journal entries
        </Link>
      )}
    </Section>
  )
}
