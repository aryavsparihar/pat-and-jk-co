import type { Post } from '@/payload-types'

import { docPath } from '@/utilities/docHref'
import { formatDate } from '@/utilities/formatDateTime'
import Link from 'next/link'
import React from 'react'

import { Media } from '../Media'
import { MotifPanel } from '../MotifPanel'

export const PostCard: React.FC<{ post: Post }> = ({ post }) => {
  const image =
    (post.heroImage && typeof post.heroImage === 'object' && post.heroImage) ||
    (post.meta?.image && typeof post.meta.image === 'object' && post.meta.image) ||
    null
  const category = post.categories?.find((c) => typeof c === 'object')
  const excerpt = post.excerpt || post.meta?.description

  return (
    <Link className="group block" href={docPath('posts', post.slug)}>
      <div className="zoom-media relative aspect-[3/2] overflow-hidden">
        {image ? (
          <Media
            fill
            imgClassName="object-cover"
            resource={image}
            size="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <MotifPanel size="sm" subtitle="Journal" />
        )}
      </div>
      <p className="eyebrow mt-6">
        {post.publishedAt && (
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        )}
        {category && typeof category === 'object' && <> · {category.title}</>}
      </p>
      <h3 className="display-sm mt-3 transition-colors group-hover:text-primary">{post.title}</h3>
      {excerpt && (
        <p className="mt-3 line-clamp-3 text-[0.95rem] leading-relaxed text-muted-foreground">
          {excerpt}
        </p>
      )}
      <span className="btn-text mt-5">
        Read{' '}
        <span aria-hidden className="arrow">
          →
        </span>
      </span>
    </Link>
  )
}
