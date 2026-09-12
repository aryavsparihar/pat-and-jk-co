import type { Post } from '@/payload-types'

import { docPath } from '@/utilities/docHref'
import { formatDate } from '@/utilities/formatDateTime'
import Link from 'next/link'
import React from 'react'

import { Media } from '../Media'

/** One entry in a journal list: date in the margin, title and excerpt, image only if there is one. */
export const PostRow: React.FC<{ post: Post }> = ({ post }) => {
  const image =
    (post.heroImage && typeof post.heroImage === 'object' && post.heroImage) ||
    (post.meta?.image && typeof post.meta.image === 'object' && post.meta.image) ||
    null
  const category = post.categories?.find((c) => typeof c === 'object')
  const excerpt = post.excerpt || post.meta?.description

  return (
    <li className="border-b border-border">
      <Link
        className="group grid gap-x-8 gap-y-3 py-8 sm:grid-cols-[10rem_1fr]"
        href={docPath('posts', post.slug)}
      >
        <span className="label pt-1">
          {post.publishedAt && (
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          )}
          {category && typeof category === 'object' && (
            <span className="block">{category.title}</span>
          )}
        </span>
        <span className="grid gap-x-8 gap-y-4 md:grid-cols-[1fr_auto]">
          <span>
            <span className="display-sm block decoration-1 underline-offset-[0.2em] group-hover:underline">
              {post.title}
            </span>
            {excerpt && <span className="muted measure mt-2 block">{excerpt}</span>}
          </span>
          {image && (
            <span className="relative block aspect-[4/3] w-full overflow-hidden bg-surface md:w-44">
              <Media fill imgClassName="object-cover" resource={image} size="200px" />
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}
